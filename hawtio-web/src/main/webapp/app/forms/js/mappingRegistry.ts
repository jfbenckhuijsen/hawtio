/**
 * @module Forms
 */
///<reference path="formHelpers.ts"/>
module Forms {

  /**
   * Create a DOM widget tree for the given set of form configuration data.
   *
   * This will include either the standard AngularJS widgets or custom widgets
   */
  export function createWidget(propTypeName, property, schema, config, id, ignorePrefixInLabel, configScopeName, wrapInGroup = true) {
    var input = null;
    var group = null;

    function copyElementAttributes(element, propertyName) {
      var propertyAttributes = property[propertyName];
      if (propertyAttributes) {
        angular.forEach(propertyAttributes, function (value, key) {
          if (angular.isString(value)) {
            element.attr(key, value);
          }
        });
      }

    }
    function copyAttributes() {
      copyElementAttributes(input, "input-attributes");
      angular.forEach(property, function (value, key) {
        if (angular.isString(value) && key.indexOf("$") < 0 && key !== "type") {
          var html = Core.escapeHtml(value);
          input.attr(key, html);
        }
      });
    }

    // lets try to create standard widget markup by default
    // as they work better than the hawtio wrappers when inside forms...
    var options = {
      valueConverter: null
    };
    var safeId = Forms.safeIdentifier(id);

    var inputMarkup = createStandardWidgetMarkup(propTypeName, property, schema, config, options, safeId);

    // Note if for whatever reason we need to go back to the old way of using hawtio directives for standard
    // angularjs directives, just clear inputMarker to null here ;)
    // inputMarkup = null;

    if (inputMarkup) {
      input = $(inputMarkup);

      copyAttributes();

      id = safeId;

      var modelName = config.model || Core.pathGet(property, ["input-attributes", "ng-model"]);
      if (!modelName) {
        modelName = config.getEntity() + "." + id;
      }
      input.attr("ng-model", modelName);

      input.attr('name', id);

      if (propTypeName !== "java.lang.Boolean") {
        input.addClass("form-control");
      }

      try {
        if (config.isReadOnly()) {
          input.attr('readonly', 'true');
        }
      } catch (e) {
        // ignore missing read only function
      }
      var title = property.tooltip || property.label;
      if (title) {
        input.attr('title', title);
      }

      // allow the prefix to be trimmed from the label if enabled
      var defaultLabel = id;
      if (ignorePrefixInLabel || property.ignorePrefixInLabel) {
        var idx = id.lastIndexOf('.');
        if (idx > 0) {
          defaultLabel = id.substring(idx + 1);
        }
      }
      // figure out which things to not wrap in a group and label etc...
      if (input.attr("type") !== "hidden" && wrapInGroup) {
        group = this.getControlGroup(config, config, id);
        var labelElement = Forms.getLabel(config, config, property.title || property.label || Core.humanizeValue(defaultLabel));
        labelElement.addClass("col-md-4");
        if (title) {
          labelElement.attr('title', title);
        }
        group.append(labelElement);
        copyElementAttributes(labelElement, "label-attributes");

        var controlDiv = Forms.getControlDiv(config);
        controlDiv.addClass("col-md-6");
        if (propTypeName === "java.lang.Boolean") {
          // hack!
          controlDiv.attr("style", "display: table-cell");
          input.attr("style", "vertical-align: middle");
        }
        controlDiv.append(input);
        controlDiv.append(Forms.getHelpSpan(config, config, id));

        group.append(controlDiv);

        // allow control level directives, such as ng-show / ng-hide
        copyElementAttributes(controlDiv, "control-attributes");
        copyElementAttributes(group, "control-group-attributes");

        var scope = config.scope;
        if (scope && modelName) {
          var onModelChange = function(newValue) {
            scope.$emit("hawtio.form.modelChange", modelName, newValue);
          };
          var fn = onModelChange;
          // allow custom converters
          var converterFn = options.valueConverter;
          if (converterFn) {
            fn = function() {
              converterFn(scope, modelName);
              var newValue = Core.pathGet(scope, modelName);
              onModelChange(newValue);
            }
          }
          scope.$watch(modelName, fn);
        }
      }
    } else {
      input = $('<div></div>');
      input.attr(Forms.normalize(propTypeName, property, schema), '');

      copyAttributes();

      input.attr('entity', config.getEntity());
      input.attr('mode', config.getMode());

      var fullSchemaName = config.schemaName;
      if (fullSchemaName) {
        input.attr('schema', fullSchemaName);
      }

      if (configScopeName) {
        input.attr('data', configScopeName);
      }

      if (ignorePrefixInLabel || property.ignorePrefixInLabel) {
        input.attr('ignore-prefix-in-label', true);
      }
      input.attr('name', id);
    }

    var label = property.label;
    if (label) {
      input.attr('title', label);
    }


    // TODO check for id in the schema["required"] array too!
    // as required can be specified either via either of these approaches
/*
    var schema = {
      required: ["foo", "bar"],
      properties: {
        something: {
          required: true,
          type: "string"
        }
      }
    }
*/
    if (property.required) {
      // don't mark checkboxes as required
      if (input[0].localName === "input" && input.attr("type") === "checkbox") {
        // lets not set required on a checkbox, it doesn't make any sense ;)
      } else {
        input.attr('required', 'true');
      }
    }
    return group ? group : input;
  }

  /**
   * Lets try create the standard angular JS widgets markup
   * @method createStandardWidgetMarkup
   * @param {String} propTypeName
   * @param {any} property
   * @param {any} schema
   * @param {any} config
   * @param {any} options
   * @param {String} id
   */
  export function createStandardWidgetMarkup(propTypeName, property, schema, config, options, id) {
    // lets try use standard widgets first...
    var type = Forms.resolveTypeNameAlias(propTypeName, schema);
    if (!type) {
      return '<input type="text"/>';
    }
    var custom = Core.pathGet(property, ["formTemplate"]);
    if (custom) {
      return null;
    }
    var inputElement = Core.pathGet(property, ["input-element"]);
    if (inputElement) {
      return "<" + inputElement + "></" + inputElement + ">";
    }
    var enumValues = Core.pathGet(property, ["enum"]);
    if (enumValues) {
      var required = true;
      var valuesScopeName = null;
      var attributes = "";
      if (enumValues) {
        // calculate from input attributes...
        var scope = config.scope;
        var data = config.data;
        if (data && scope) {
          // this is a big ugly - would be nice to expose this a bit easier...
          // maybe nested objects should expose the model easily...
          var fullSchema = scope[config.schemaName];
          var model = angular.isString(data) ? scope[data] : data;
          // now we need to keep walking the model to find the enum values
          var paths = id.split(".");
          var property = null;
          angular.forEach(paths, (path) => {
            property = Core.pathGet(model, ["properties", path]);
            var typeName = Core.pathGet(property, ["type"]);
            var alias = Forms.lookupDefinition(typeName, fullSchema);
            if (alias) {
              model = alias;
            }
          });
          var values = Core.pathGet(property, ["enum"]);
          valuesScopeName = "$values_" + id.replace(/\./g, "_");
          scope[valuesScopeName] = values;
        }
      }
      if (valuesScopeName) {
        attributes += ' ng-options="value for value in ' + valuesScopeName + '"';
      }
      var defaultOption = required ? "" : '<option value=""></option>';
      return '<select' + attributes + '>' + defaultOption + '</select>';
    }

    if (angular.isArray(type)) {
      // TODO union of tabbed forms such as Marshal / Unmarshal in camel...
      return null;
    }
    if (!angular.isString(type)) {
      return null;
    }
    var defaultValueConverter = null;
    var defaultValue = property.default;
    if (defaultValue) {
        // lets add a default value
        defaultValueConverter = function (scope, modelName) {
          var value = Core.pathGet(scope, modelName);
          if (!value)  {
            Core.pathSet(scope, modelName, property.default);
          }
        };
        options.valueConverter = defaultValueConverter;
    }

    function getModelValueOrDefault(scope, modelName) {
      var value = Core.pathGet(scope, modelName);
      if (!value) {
        var defaultValue = property.default;
        if (defaultValue) {
          value = defaultValue;
          Core.pathSet(scope, modelName, value);
        }
      }
      return value;
    }

    switch (type.toLowerCase()) {
      case "int":
      case "integer":
      case "long":
      case "short":
      case "java.lang.integer":
      case "java.lang.long":
      case "float":
      case "double":
      case "java.lang.float":
      case "java.lang.double":
        // lets add a value conversion watcher...
        options.valueConverter = function (scope, modelName) {
          var value = getModelValueOrDefault(scope, modelName);
          if (value && angular.isString(value))  {
            var numberValue = Number(value);
            Core.pathSet(scope, modelName, numberValue);
          }
        };
        return '<input type="number"/>';

      // collections or arrays
      case "array":
      case "java.lang.array":
      case "java.lang.iterable":
      case "java.util.list":
      case "java.util.collection":
      case "java.util.iterator":
      case "java.util.set":
      case "object[]":

        // TODO hack for now - objects should not really use the table, thats only really for arrays...
        /*
         case "object":
         case "java.lang.object":
         */
        //return "hawtio-form-array";
        return null;

      case "boolean":
      case "bool":
      case "java.lang.boolean":
        // lets add a value conversion watcher...
        options.valueConverter = function (scope, modelName) {
          var value = getModelValueOrDefault(scope, modelName);
          if (value && "true" === value)  {
            //console.log("coercing String to boolean for " + modelName);
            Core.pathSet(scope, modelName, true);
          }
        };
        return '<input type="checkbox"/>';

      case "password":
        return '<input type="password"/>';

      case "hidden":
        return '<input type="hidden"/>';
      default:
        // lets check if this name is an alias to a definition in the schema
        return '<input type="text"/>';
    }
  }

  export function normalize(type, property, schema) {
    type = Forms.resolveTypeNameAlias(type, schema);
    if (!type) {
      return "hawtio-form-text";
    }
    var custom = Core.pathGet(property, ["formTemplate"]);
    if (custom) {
      return "hawtio-form-custom";
    }
    var enumValues = Core.pathGet(property, ["enum"]);
    if (enumValues) {
      // TODO could use different kinds of radio / combo box
      return "hawtio-form-select";
    }

    if (angular.isArray(type)) {
      // TODO union of tabbed forms such as Marshal / Unmarshal in camel...
      return null;
    }
    if (!angular.isString(type)) {
      try {
        console.log("Unsupported JSON schema type value " + JSON.stringify(type));
      } catch (e) {
        console.log("Unsupported JSON schema type value " + type);
      }
      return null;
    }
    switch (type.toLowerCase()) {
      case "int":
      case "integer":
      case "long":
      case "short":
      case "java.lang.integer":
      case "java.lang.long":
      case "float":
      case "double":
      case "java.lang.float":
      case "java.lang.double":
        return "hawtio-form-number";

      // collections or arrays
      case "array":
      case "java.lang.array":
      case "java.lang.iterable":
      case "java.util.list":
      case "java.util.collection":
      case "java.util.iterator":
      case "java.util.set":
      case "object[]":

        // TODO hack for now - objects should not really use the table, thats only really for arrays...
        /*
         case "object":
         case "java.lang.object":
         */
        var items = property.items;
        if (items) {
          var typeName = items.type;
          if (typeName && typeName === "string") {
            return "hawtio-form-string-array";
          }
        } else {
          // let's use the string array if no type is set,
          // at least that provides a form of some kind
          return "hawtio-form-string-array";
        }
        return "hawtio-form-array";
      case "boolean":
      case "bool":
      case "java.lang.boolean":
        return "hawtio-form-checkbox";
      case "password":
        return "hawtio-form-password";
      case "hidden":
        return "hawtio-form-hidden";
      default:
        // lets check if this name is an alias to a definition in the schema
        return "hawtio-form-text";
    }
  }
}
