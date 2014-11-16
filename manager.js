var RecordModel = function() {
	Movie.EventTarget.call(this);

	var self = this;
	var root = null;
	var records = {};
	var waitings = {};
	
	$.ajax({
		type : 'GET',
		url : '/padmenu/rest/record/543d65f5e4b0c78c86e7db7d',
		contentType : 'application/json',
		success : function(result) {
			root = result;
			records[root.id] = root;
			addToQueue([], root);
		},
		async : false
	});

	function addToQueue(queue, category) {
		for (var i = 0; i < category.child.length; i++) {
			queue.push({
				id : category.child[i],
				parent : category.id
			});
		}
		init(queue);
	}

	function init(queue) {
		if (queue.length > 0) {
			var item = queue.shift();
			$.ajax({
				type : 'GET',
				url : '/padmenu/rest/record/' + item.id,
				contentType : 'application/json',
				success : function(result) {
					result.parent = records[item.parent];
					records[result.id] = result;
					for (var ns in waitings) {
						var localWaitings = waitings[ns];
						var waiting = localWaitings[result.id];
						while (waiting && waiting.length) {
							waiting.shift().call(result, result);
						}
					}
					if (result.type === 'category') {
						addToQueue(queue, result);
					} else {
						init(queue);
					}
				}
			});
		}
	}

	function updateNestedRecords(category) {
		for (var i = 0; i < category.child.length; i++) {
			var record = records[category.child[i]];
			if (record) {
				record.parent = category;
			}
		}
	}

	this.get = function(arg0, arg1, arg2) {
		if (typeof arg1 === 'undefined' && typeof arg2 === 'undefined') {
			return records;
		}
		if (typeof arg1 === 'function') {
			arg1.call(root, root);
		}
		if (arg1 in records) {
			arg2.call(records[arg1], records[arg1]);
		} else {
			waitings[arg0] = waitings[arg0] || {};
			var localWaitings = waitings[arg0];
			localWaitings[arg1] = localWaitings[arg1] || [];
			var waiting = localWaitings[arg1];
			waiting.push(arg2);
		}
	}

	this.find = function(query) {
		var resultArray = [];
		var Result = function(records) {
			var iterator = 0;
			this.next = function() {
				return iterator < records.length ? records[iterator++] : null;
			}
			this.getRecords = function() {
				return records;
			}
		}
		for (var id in records) {
			Movie.o.match(records[id], query) && resultArray.push(records[id]);
		}
		return new Result(resultArray);
	}

	this.remove = function(id, callback) {
		if (id in records) {
			$.ajax({
				type : 'DELETE',
				url : '/padmenu/rest/record/' + id,
				contentType : 'application/json',
				success : function(result) {
					delete records[id];
					callback &&	callback.call(result, result);
				}
			});
		}
	}

	this.save = function(record, callback) {
		var copy = Movie.o.merge({}, record, true);
		delete copy.parent;
		if (copy.id in records) {
			$.ajax({
				type : 'PUT',
				url : '/padmenu/rest/record/' + copy.id,
				contentType : 'application/json',
				data : JSON.stringify(copy),
				success : function(result) {
					result.parent = record.parent 
						? records[record.parent.id] : null;
					records[result.id] = result;
					if (result.type === 'category' || result.type === 'root') {
						updateNestedRecords(result);
					}
					self.fire('change', result);
					callback && callback.call(result, result);
				}
			});
		} else {
			$.ajax({
				type : 'POST',
				url : '/padmenu/rest/record',
				contentType : 'application/json',
				data : JSON.stringify(copy),
				success : function(data, textStatus, jqXHR) {
					record.id = jqXHR.getResponseHeader('location');
					records[record.id] = record;
					callback && callback.call(record, record);
				}
			});
		}
	}

	this.clone = function(record, callback) {
		$.ajax({
			type : 'POST',
			url : '/padmenu/rest/record/clone/' + record.id,
			contentType : 'application/json',
			data : JSON.stringify(record),
			success : function(data, textStatus, jqXHR) {
				var clone = data;
				records[clone.id] = clone;
				callback && callback.call(clone, clone);
				addToQueue([], clone);
			}
		});
	}

	this.reset = function(ns, ids) {
		if (Array.isArray(ids)) {
			ids.map(function(id) {
				delete waitings[ns][id];
			});
		} else if (ids) {
			delete waitings[ns][ids];
		} else {
			delete waitings[ns];
		}
	}

	this.getJoystick = function(ns) {
		return {
			get : function(id, callback) {
				return self.get.call(self, ns, id, callback);
			},
			save : function(record, callback) {
				self.save.call(self, record, callback);
			},
			clone : function(record, callback) {
				self.clone.call(self, record, callback);
			},
			find : function(query) {
				return self.find(query);
			},
			remove : function(id, callback) {
				self.remove.call(self, id, callback);
			},
			reset : function() {
				self.reset.call(self, ns);
			}
		}
	}

}
Movie.extend(Movie.EventTarget, RecordModel);

var RecordManager = function($container, model) {
	Movie.EventTarget.call(this);

	var self = this;
	var $view = $('<div class="pd-record-records"/>');
	var $switcher = $('<div class="pd-record-switcher"/>');
	var $toolbar = $('<div class="pd-record-toolbar"/>');
	var joystick = model.getJoystick('record-manager');
	var $selected = null;
	var lang = 'ru';

	function ItemFabric($view) {

		var self = {
			create : function($switchElement) {
				self.switchElement = $switchElement;
				$view.addClass('pd-record-item');
				$view.append($('<label/>'));
				$view.pdDraggable();
				return this;
			},
			render : function(model) {
				var $switchElement = self.switchElement;
				$view.data('model', model);
				$view.attr('id', model.id);
				$view.children('label').html(model.attr[lang].name);
				if ($switchElement) {
					$switchElement.attr('id', model.id + '_');
					$switchElement.on('change', function() {
						if (this.checked) {
							onInclude.call(model, model);
						} else {
							onExclude.call(model, model);
						}
					});
				}
				updateSwitchers(model);

				if (model.type === 'category') {
					if ($view.hasClass('pd-record-category')) {
						if ($view.children('input').get(0).checked) {
							getNestedRecords(model, function(records) {
								syncRecords($view
									.children('.pd-record-children'), records);
							});
						}
					} else {
						$view.addClass('pd-record-category');
						var $e = $('<input type="checkbox">');
						$e.on('change', function() {
							if (this.checked) {
								self.expand($view);
							} else {
								self.collapse(true, $view);
							}
						});
						$view.prepend($e);
						$view.append($('<div class="pd-record-children"/>'));
					}
				}
				return this;
			},
			expand : function($record) {
				$view = $record ? $record : $view;
				$view.children('label').addClass('pd-record-loading')
					.append('<span> [0/' + $view.data('model').child.length 
						+ ']</span>');
				$view.children('input[type="checkbox"]').
					get(0).checked = true;
				getNestedRecords($view.data('model'), 
					function(records) {
						syncRecords($view.children('.pd-record-children'), 
							records);
					},
					function(loadingState) {
						$view.find('span').text(' [' 
							+ (loadingState.i + 1) + '/' + loadingState.n 
								+ ']');
					});
				return this;
			},
			collapse : function(deep, $record) {
				$view = $record ? $record : $view;
				if (deep) {
					var categories = $view.find('.pd-record-category')
						.get().reverse();
					$.each(categories, function(i, e) {
						ItemFabric($(e)).collapse();
					});
				}
				$view.children('input[type="checkbox"]').
									get(0).checked = false;
				var $nested = $view.children('.pd-record-children');
				$nested.children().each(function(i, e) {
					$switcher.find('#' + e.id + '_').parent().remove();
				});
				$nested.empty();

				return this;
			},
			buildProperties : function($properties) {
				function renderAdditional($container) {
					$container.empty();
					for (var name in attributes) {
						if (ignoreProperties.indexOf(name) !== -1) continue;
						switch(typeof attributes[name]) {
							case 'string':
								$container.append(fabric.createStringProperty(
									name, name, onChange)
									.append(createDeleteButton(name)));
								break;
							case 'number':
								$container.append(fabric.createNumberProperty(
									name, name, onChange)
									.append(createDeleteButton(name)));
								break;
							case 'boolean':
								$container.append(fabric.createBooleanProperty(
									name, name, onChange)
									.append(createDeleteButton(name)));
								break;
						}	
					}
					return $container;
				}
				function renderImages($container) {
					$container.empty();
					var $loading = $('<img src="resources/images/loading.png">');
					var $uploadForm = $('<form enctype="multipart/form-data"/>');
					$uploadForm.on('submit', function(e) {
						e.preventDefault();
						var formData = new FormData(this);
						$uploadForm.html($loading);
						$.ajax({
							type : 'POST',
							url : '/padmenu/rest/file/media',
							cache : false,
							contentType : false,
							processData : false,
							data : formData,
							success : function(data) {
								model.media.unshift(data.url);
							},
							complete : function() {
								renderImages($container);
							}
						});
					});
					$uploadForm.append($('<span/>')
						.append($('<input accept="image/*" name="image" '
							+ 'type="file">')
								.on('change', function() {
									$uploadForm.submit();
						})));
					$container.append($('<div class="pd-record-property' 
						+ ' pd-record-addbutton"/>').append($uploadForm));
					images.map(function(src) {
						var $imgProperty = $('<div class="pd-record-property"/>');
						$imgProperty.append($('<img src="' + src + '">'))
							.append($('<button/>').on('click', function() {
								images.splice(images.indexOf(src), 1);
								renderImages($container);
							}));
						$container.append($imgProperty);
					})
					return $container;
				}
				function createDeleteButton(name) {
					var $button = $('<button/>');
					$button.on('click', function() {
						delete attributes[name];
						renderAdditional($additional);
					});
					return $button;
				}
				function onAddPropertyClick() {
					var $dialog = $('<div/>');
					$dialog.appendTo(document.body);
					var $content = $('<div/>');
					function onChange(name, value) {
						property[name] = value;
					}
					var property = {
						name : '',
						type : 'string'
					};
					var fabric = PropertyFabric(property);
					$content.append(fabric
						.createStringProperty('name', 'Наименование', onChange));
					var $radio = $('<div class="pd-property-radiogroup"/>');
					$content.append($radio);
					$radio.append(
						$('<label class="line"><input checked type="radio"' + 
							' name="type">Текстовое поле</label>')
								.on('change', onChange
									.bind(this, 'type', 'string')));
					$radio.append(
						$('<label class="line"><input type="radio" name="type">'
							+ 'Число</label>')
								.on('change', onChange
									.bind(this, 'type', 'number')));
					$radio.append(
						$('<label class="line"><input type="radio" name="type">'
							+ 'Логическое поле</label>')
								.on('change', onChange
									.bind(this, 'type', 'boolean')));
					$dialog.pdDialog({
						title : 'Новый параметр номенклатуры',
						class : 'pd-dialog-subwindow',
						content : $content,
						confirmLabel : 'Добавить',
						cancelLabel : 'Закрыть',
						confirm : function() {
							if (ignoreProperties.indexOf(property.name) !== -1)
								return;
							if (typeof attributes[property.name] === 'undefined')
								attributes[property.name] = property.type === 
									'string' ? '' : (property.type === 
										'number' ? 0 : false);
							renderAdditional($additional);
						}
					});
				}

				var ignoreProperties = ['id', 'name', 'desc', 'media', 'price', 
					'portion', 'property'];

				function onChange(name, value) {
					attributes[name] = value;
				}
				var model = $view.data('model');
				var attributes = Movie.o.merge(model.attr[lang], 
					model.attr.langless);
				model.attr.langless = {};
				var images = model.media;

				var fabric = PropertyFabric(attributes);
				$properties.append(fabric
					.createStringProperty('name', 'Наименование', onChange));
				if (model.type === 'item') {
					$properties.append(fabric
						.createNumberProperty('price', 'Цена', onChange)
							.addClass('pd-record-property-inline'));
					$properties.append(fabric
						.createNumberProperty('portion', 'Порция', onChange)
							.addClass('pd-record-property-inline'));
					$properties.append(fabric
						.createNumberProperty('property', 'Параметр', onChange)
							.addClass('pd-record-property-inline'));
				}
				$properties.append(fabric
					.createTextProperty('desc', 'Описание', onChange));
				var $additionalButtons = $('<div class="pd-record-header"/>');
				$additionalButtons
					.append('<span>Дополнительные параметры</span>');
				$additionalButtons.append($('<a href="#">Добавить параметр</a>')
					.on('click', onAddPropertyClick));
				$properties.append($additionalButtons);
				var $additional = $('<div class="pd-record-additional"/>');
				$properties.append(renderAdditional($additional));
				$properties.append('<div class="pd-record-header">' 
					+ '<span>Изображения</span></div>');
				var $images = $('<div class="pd-record-images"/>');
				$properties.append($images.append(renderImages($('<div/>'))));
				return this;
			}
		}
		return self;
	}

	var PropertyFabric = function(values) {
		function createProperty(label, $control, classes) {
			var $property = $('<div class="pd-record-property"/>');
			classes && $property.addClass(classes);
			$property.append($('<label class="pd-record-property-label">' 
				+ label + '</label>'));
			$property.append($control);
			return $property;
		}
		var fabric = {};
		fabric.createStringProperty = function(name, label, onChange) {
			var $control = $('<input type="text">');
			if (onChange) {
				$control.on('keydown', function(e) {
					setTimeout(function(text) {
						var value = $(this).val();
						value === text || onChange(name, value);
					}.bind(this, $(this).val()), 1);
				});
			} else {
				$control.attr('readonly', 'readonly');
			}
			$control.val(values[name]);
			return createProperty(label, $control);
			
		}
		fabric.createNumberProperty = function(name, label, onChange, min, 
				max, step) {
			var $control = $('<input type="number">');
			min && $control.attr('min', min);
			max && $control.attr('max', max);
			step && $control.attr('step', step);
			if (onChange) {
				$control.on('change', function() {
					onChange(name, parseFloat($(this).val()));
				});
			} else {
				$control.attr('readonly', 'readonly');
			}
			$control.val(values[name]);
			return createProperty(label, $control);
		}
		fabric.createBooleanProperty = function(name, label, onChange) {
			var $control = $('<input type="checkbox">');
			if (onChange) {
				$control.on('change', function() {
					onChange(name, this.checked);
				});
			} else {
				$control.attr('readonly', 'readonly');
			}
			$control.prop('checked', values[name]);
			return createProperty(label, $control, 'pd-record-property-boolean');
		}
		fabric.createTextProperty = function(name, label, onChange) {
			var $control = $('<textarea rows="5"></textarea>');
			$control.css({
				'width' : '100%',
				'resize' : 'none'
			});
			if (onChange) {
				$control.on('keydown', function(e) {
					setTimeout(function(text) {
						var value = $(this).val();
						value === text || onChange(name, value);
					}.bind(this, $(this).val()), 1);
				});
			} else {
				$control.attr('readonly', 'readonly');
			}
			$control.html(values[name]);
			return createProperty(label, $control);
		}
		return fabric;
	}

	function onAccept($dragObject) {
		return $dragObject.hasClass('pd-record-item');
	}

	var $lastDroppable = null;
	var insPos = 0;
	function onMove(event) {
		self.select(null);
		var $dragObject = event.dragObject;
		var $targetObject = $(document.elementFromPoint(
			parseFloat($dragObject.css('left')) - 4, 
			parseFloat($dragObject.css('top')) + 5));
		if ($targetObject !== $lastDroppable) {
			$lastDroppable && $lastDroppable
					.removeClass(function(index, css) {
						return (css.match('pd-record-highlight.*') || [])
							.join(' ');
					});
			if ($targetObject.hasClass('pd-record-item')) {
				$lastDroppable = $targetObject;
			} else if ($targetObject.parent().hasClass('pd-record-item')) { 
				$lastDroppable = $targetObject.parent(); 
			} else if ($targetObject.hasClass('pd-record-records')) {
				$lastDroppable = $targetObject;
				return;
			}
			var dpY = $lastDroppable.offset().top;
			var dgY = $dragObject.offset().top - $dragObject.height() / 4;
			if (Math.abs(dpY - dgY) <= 2) {
				insPos = 0;
				$lastDroppable.addClass('pd-record-highlight');
			} else if (dpY - dgY < 0) {
				insPos = -1;
				$lastDroppable.addClass('pd-record-highlight-bottom');
			} else {
				insPos = 1;
				$lastDroppable.addClass('pd-record-highlight-top');
			}
		}
	}

	function onDrop(event) {
		if ($lastDroppable) {
			$lastDroppable.removeClass(function(index, css) {
				return (css.match('pd-record-highlight.*') || [])
					.join(' ');
			});
			var target = $lastDroppable.data('model');
			var targetCategory = target.parent;
			var source = event.dragObject.data('model');
			var sourceCategory = source.parent;
			if (source.id === target.id) {
				return;
			}
			var parent = target.parent;
			while(parent) {
				if (source.id === parent.id) {
					return;
				}
				parent = parent.parent;
			}
			if (source.type === 'category') {
				ItemFabric(self.findById(source.id)).collapse(true);
			}
			if (target.type === 'root') {
				sourceCategory.child.splice(
					sourceCategory.child.indexOf(source.id), 1);
				joystick.save(sourceCategory, function() {
					target.child.push(source.id);
					joystick.save(target, function() {
						self.select(null);
					});
				});
				return;
			}
			if (target.type === 'category' && insPos === 0) {
				if (sourceCategory.id === target.id) {
					return;
				}
				sourceCategory.child.splice(
					sourceCategory.child.indexOf(source.id), 1)
				joystick.save(sourceCategory, function() {
					target.child.push(source.id);
					joystick.save(target, function() {
						ItemFabric($lastDroppable).expand();
						self.select(null);
					});
				});
			}
			if (insPos !== 0) {
				sourceCategory.child.splice(
					sourceCategory.child.indexOf(source.id), 1);
				joystick.save(sourceCategory, function() {
					var position = targetCategory.child.indexOf(target.id);
					insPos === -1 && position++;
					targetCategory.child.splice(position, 0, source.id);
					joystick.save(targetCategory, function() {
						self.select(null);
					});
				});
			}
		}
	}

	function onInclude(record) {
		var records = app.getWsMenuModel().get('records');
		records.push(record.id);
		app.getWsMenuModel().set('records', records);
		updateSwitchers(record);
	}

	function onExclude(record) {
		var records = app.getWsMenuModel().get('records');
		records.splice(records.indexOf(record.id), 1);
		app.getWsMenuModel().set('records', records);
		updateSwitchers(record);
	}

	function onCreateClick(type) {
		var record = null;
		if (type === 'item') {
			record = {
				type : 'item',
				attr : {
					ru : {
						name : 'Новый элемент',
						desc : ''
					},
					langless : {
						price : 0,
						portion : 0,
						property : 0
					}
				},
				media : []
			}
		} else if (type === 'category') {
			record = {
				type : 'category',
				attr : {
					ru : {
						name : 'Новая категория',
						desc : ''
					},
					langless : {}
				},
				child : [],
				media : []
			}
		}

		var category = null;
		var position = -1;
		if ($selected) {
			var selected = $selected.data('model');
			if (selected.type === 'category') {
				ItemFabric($selected).expand();
				category = selected;
				position = category.child.length;
			} else {
				category = selected.parent;
				position = category.child.indexOf(selected.id) + 1;
			}
		} else {
			category = $view.data('model');
			position = category.child.length;
		}
		joystick.save(record, function(record) {
			category.child.splice(position, 0, record.id);
			joystick.save(category, function(category) {
				//console.log('category', category);
			});
		});
	}

	function onEditClick() {
		if ($selected) {
			$selected.data('backup', Movie.o.merge({}, 
				$selected.data('model'), true));
			var $dialog = $('<div/>');
			var $content = $('<div/>');
			var $properties = $('<div/>');
			$properties.appendTo($content);
			ItemFabric($selected).buildProperties($properties);
			$dialog.appendTo(document.body);
			$dialog.pdDialog({
				title : 'Правка номенклатуры',
				content : $('<div/>').append($content),
				confirmLabel : 'Сохранить...',
				cancelLabel : 'Закрыть',
				destroy : function() {
					var model = $selected.data('backup');
					$selected.data('backup', null);
					$selected.data('model', model);
				},
				confirm : function() {
					var record = $selected.data('model');
					for (var name in record.attr[lang]) {
						if (typeof record.attr[lang][name] !== 'string') {
							record.attr.langless[name] = record.attr[lang][name];
							delete record.attr[lang][name];
						}
					}
					joystick.save(record, function() {
						
					});
				}
			});
		}
	}

	function onCloneClick() {
		if ($selected) {
			var selected = $selected.data('model');
			var category = selected.parent;
			var position = category.child.indexOf(selected.id) + 1;
			joystick.clone(selected, function(record) {
				category.child.splice(position, 0, record.id);
				joystick.save(category, function(category) {
					//console.log('category', category);
				});
			});
		}
	}

	function onDeleteClick() {
		if ($selected) {
			var record = $selected.data('model');
			var category = record.parent;
			joystick.remove(record.id, function() {
				var position = category.child
					.indexOf(record.id);
				category.child.splice(position, 1);
				joystick.save(category, function() {
					var $record = self.findById((category.child[position]
						|| category.child[category.child.length - 1])
						|| category.id)
					self.select($record.data('model').type === 'root' 
						? null : $record);
				});
			});
		}
	}

	function updateSwitchers(record) {
		updateSwitcher($('#' + record.id + '_'), 
			getState(record));
		var parent = record.parent;
		while (parent.type !== 'root') {
			updateSwitcher($('#' + parent.id + '_'), getState(parent));
			parent = parent.parent;
		}
	}

	function getState(record) {
		var records = app.getWsMenuModel().get('records');
		if (records.indexOf(record.id) !== -1) {
			return 1;
		}
		if (record.type === 'category') {
			for (var i = 0; i < record.child.length; i++) {
				if ((records.indexOf(record.child[i]) !== -1) || $('#' 
					+ record.child[i] + '_')
						.prop('indeterminate')) {
							return 0;
				}
			}
		}
		return -1;
	}

	function updateSwitcher($switchElement, state) {
		switch(state) {
			case -1:
				$switchElement.prop('indeterminate', false);
				$switchElement.get(0).checked = false;
				break;
			case 0:
				$switchElement.prop('indeterminate', true);
				$switchElement.get(0).checked = false;
				break;
			case 1:
				$switchElement.prop('indeterminate', false);
				$switchElement.get(0).checked = true;
				break;
		}
	}

	function getNestedRecords(category, callback, loading, id, result, length) {
		if (category.child.length === 0) {
			callback.call([], [], {
				i : 0,
				n : 0
			});
		} else if (typeof id === 'undefined') {
			getNestedRecords(category, callback, loading, category.child[0], [], 
				category.child.length);
		} else {
			joystick.get(id, function() {
				result.push(this);
				loading && loading.call(this, {
					i : result.length,
					n : length
				});
				var siblingId = category.child
					[category.child.indexOf(id) + 1];
				siblingId ? getNestedRecords(category, callback, loading, 
					siblingId,	result, length) : callback.call(result, result);
			});
		}
	}

	function syncRecords($container, records) {
		if (records.length === 0) {
			$container.empty();
		} else {
			var $records = $('<div/>').append($container.children().detach());
			for (var i = 0; i < records.length; i++) {
				var record = records[i];
				var $record = $records.find('#' + record.id);
				if (!$record.length) {
					$record = $('<div/>');
					var $switchElement = $('<input type="checkbox"/>');
					$('<div/>').append($switchElement).append('<div/>')
						.appendTo($switcher);
					ItemFabric($record).create($switchElement).render(record);
				}
				$container.append($record);
			}
		}
		var $detachedSwitcher = $('<div/>')
			.append($switcher.children().detach());
		$view.find('.pd-record-item').each(function(i, e) {
			$switcher.append($detachedSwitcher.find('#' + e.id + '_')
				.parent());
		});
		$container.siblings('label').removeClass('pd-record-loading')
			.children().remove();;
	}

	this.findById = function(id) {
		var $result = $('#' + id);
		if ($result.length === 0) {
			$result = null;
		}
		return $result;
	}

	this.select = function($record) {
		$selected && $selected.removeClass('pd-record-selected');
		$selected = $record;
		$record && $record.addClass('pd-record-selected');
	}

	$container.pdDroppable({
		accept : onAccept,
		move : onMove,
		drop : onDrop
	});

	$view.on('click', function(e) {
		var $t = $(e.target);
		if ($t.is('label') && $t.parent().hasClass('pd-record-item')) {
			self.select($t.parent());
		} else if (!$t.is('input[type="checkbox"]')) {
			self.select(null);
		}
	});

	$view.on('dblclick', function(e) {
		var $t = $(e.target);
		$t.is('label') && $t.parent().hasClass('pd-record-item') 
			&& onEditClick();
	});

	model.on('change', function(record) {
		if (record.type === 'root') {
			$view.data('model', record);
			getNestedRecords(record, function(records) {
				syncRecords($view, 
					records);
			});
		} else {
			var $record = self.findById(record.id);
			ItemFabric($record).render(record);
		}
	});

	$container
		.append($toolbar);
	$container = $('<div class="pd-record"/>').appendTo($container);
		$container
		.append($switcher)
		.append($view);

	joystick.get(function(root) {
		$view.data('model', root);
		$view.attr('id', root.id);
		getNestedRecords(root, function(records) { 
			syncRecords($view, records);
		});
	});

	var $search = $('<div class="pd-record-search"/>');
	var $searchLine = $('<input type="text" placeholder="Поиск"/>');
	var searchResult = null;
	$searchLine.on('keyup', function(e) {
		if (e.keyCode === 13) {
			if (searchResult) {
				var record = searchResult.next();
				if (record) {
					var records = [];
					records.unshift(record);
					var parent = record.parent;
					while (parent.type !== 'root') {
						records.unshift(parent);
						parent = parent.parent;
					}
					while (records.length > 1) {
						ItemFabric(self.findById(records.shift().id)).expand();
					}
					self.select(self.findById(records.shift().id));
				} else {
					searchResult = null;
				}
			} else {
				var query = {};
				query.attr = {};
				query.attr[lang] = {
					name : function(value) {
						return value.match(new RegExp(e.target.value,"i"));
					}
				}
				searchResult = joystick.find(query);
				$(this).trigger(e);
			}
		} else {
			searchResult = null;
		}
	});
	var $searchButton = $('<button/>');
	$searchButton.on('click', function() {
		$(this).siblings().trigger($.Event('keyup', {
			keyCode : 13
		}));
	});
	$search.append($searchLine).append($searchButton);

	$toolbar.pdToolbar({
		source : [{
			name : 'item',
			type : 'class',
			value : 'pd-record-create-item',
			click : onCreateClick.bind(this, 'item')
		},{
			name : 'category',
			type : 'class',
			value : 'pd-record-create-category',
			click : onCreateClick.bind(this, 'category')
		},{
			type : 'separator'
		},{
			name : 'clone',
			type : 'class',
			value : 'pd-record-clone',
			click : onCloneClick.bind(this)
		},{
			name : 'edit',
			type : 'class',
			value : 'pd-record-edit',
			click : onEditClick.bind(this)
		},{
			name : 'delete',
			type : 'class',
			value : 'pd-record-delete',
			click : onDeleteClick.bind(this)
		},{
			name : 'search',
			type : 'jquery',
			value : $search
		}]
	});
}
Movie.extend(Movie.EventTarget, RecordManager);