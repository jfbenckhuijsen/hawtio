/**
 * @module Osgi
 */
/// <reference path="./osgiPlugin.ts"/>
module Osgi {
  _module.controller("Osgi.PidController", ["$scope", "$timeout", "$routeParams", "$location", "workspace", "jolokia", ($scope, $timeout, $routeParams, $location, workspace:Workspace, jolokia) => {
    $scope.deletePropDialog = new UI.Dialog();
    $scope.deletePidDialog = new UI.Dialog();
    $scope.addPropertyDialog = new UI.Dialog();
    $scope.factoryPid = $routeParams.factoryPid;
    $scope.pid = $routeParams.pid || $scope.factoryPid;

    $scope.selectValues = {};

    $scope.modelLoaded = false;
    $scope.canSave = false;

    $scope.setEditMode = (flag) => {
      $scope.editMode = flag;
      $scope.formMode = flag ? "edit" : "view";
      if (!flag || !$scope.entity) {
        $scope.entity = {};
        updateTableContents();
      }
    };
    var startInEditMode = $scope.factoryPid && !$routeParams.pid;
    $scope.setEditMode(startInEditMode);

    $scope.$on("hawtio.form.modelChange", () => {
      if ($scope.modelLoaded) {
        // TODO lets check if we've really changed the values!
        enableCanSave();
        Core.$apply($scope);
      }
    });

    initProfileScope($scope, $routeParams, $location, localStorage, jolokia, workspace, () => {
      updateTableContents();
    });

    function updatePid(mbean, pid, data) {
      var completeFn = (response) => {
        Core.notification("success", "Successfully updated pid: " + pid);

        if (pid && $scope.factoryPid && !$routeParams.pid && !$scope.zkPid) {
          // we've just created a new pid so lets move to the full pid URL
          var newPath = createConfigPidPath($scope, pid, $scope.factoryPid);
          $location.path(newPath);
        } else {
          $scope.setEditMode(false);
          $scope.canSave = false;
          $scope.saved = true;
        }
      };
      var callback = onSuccess(completeFn, errorHandler("Failed to update: " + pid));
      if ($scope.inFabricProfile) {
        jolokia.execute(Fabric.managerMBean, "setProfileProperties", $scope.versionId, $scope.profileId, pid, data, callback);
      } else {
        var json = JSON.stringify(data);
        $scope.jolokia.execute(mbean, "configAdminUpdate", pid, json, callback);
      }
    }

    $scope.pidSave = () => {
      var data = {};

      angular.forEach($scope.entity, (value, key) => {
        var text = undefined;
        if (angular.isString(value)) {
          text = value;
        } else if (angular.isDefined(value)) {
          text = value.toString();
        }
        if (angular.isDefined(text)) {
          data[decodeKey(key)] = text;
        }
      });

      //log.info("about to update value " + angular.toJson(data));

      var mbean = getHawtioConfigAdminMBean(workspace);
      if (mbean) {
        var pidMBean = getSelectionConfigAdminMBean($scope.workspace);
        var pid = $scope.pid;
        var zkPid = $scope.zkPid;
        var factoryPid = $scope.factoryPid;
        if (factoryPid && pidMBean && !zkPid) {
          // lets generate a new pid
          $scope.jolokia.execute(pidMBean, "createFactoryConfiguration", factoryPid, onSuccess((response) => {
            pid = response;
            if (pid) {
              updatePid(mbean, pid, data);
            }
          }, errorHandler("Failed to create new PID: ")));
        } else {
          if (zkPid) {
            pid = zkPid;
          }
          updatePid(mbean, pid, data);
        }
      }
    };

    function errorHandler(message) {
       return {
         error: (response) => {
           Core.notification("error", message + "\n" + response['error'] || response);
           Core.defaultJolokiaErrorHandler(response);
         }
       }
    }

    function enableCanSave() {
      if ($scope.editMode) {
        $scope.canSave = true;
      }
    }

    $scope.addPropertyConfirmed = (key, value) => {
      $scope.addPropertyDialog.close();
      $scope.configValues[key] = {
        Key: key,
        Value: value,
        Type: "String"
      };
      enableCanSave();
      updateSchema();
    };

    $scope.deletePidProp = (e) => {
      $scope.deleteKey = e.Key;
      $scope.deletePropDialog.open();
    };

    $scope.deletePidPropConfirmed = () => {
      $scope.deletePropDialog.close();
      var cell:any = document.getElementById("pid." + $scope.deleteKey);
      cell.parentElement.remove();
      enableCanSave();
    };

    $scope.deletePidConfirmed = () => {
      $scope.deletePidDialog.close();

      var mbean = getSelectionConfigAdminMBean($scope.workspace);
      if (mbean) {
        $scope.jolokia.request({
          type: "exec",
          mbean: mbean,
          operation: 'delete',
          arguments: [$scope.pid]
        }, {
          error: function (response) {
            Core.notification("error", response.error);
          },
          success: function (response) {
            Core.notification("success", "Successfully deleted pid: " + $scope.pid);
            $location.path($scope.configurationsLink);
          }
        });
      }
    };

    function populateTable(response) {
      $scope.modelLoaded = true;
      var configValues = response || {};
      $scope.configValues = configValues;
      $scope.zkPid = Core.pathGet(configValues, ["fabric.zookeeper.pid", "Value"]);

      if ($scope.zkPid && $scope.saved) {
        // lets load the current properties direct from git
        // in case we have just saved them into git and config admin hasn't yet
        // quite caught up yet (to avoid freaking the user out that things look like
        // changes got reverted ;)
        function onProfileProperties(gitProperties) {
          angular.forEach(gitProperties, (value, key) => {
            var configProperty = configValues[key];
            if (configProperty) {
              configProperty.Value = value;
            }
          });
          updateSchemaAndLoadMetaType();
          Core.$apply($scope);
        }
        jolokia.execute(Fabric.managerMBean, "getProfileProperties", $scope.versionId, $scope.profileId, $scope.zkPid, onSuccess(onProfileProperties));
      } else {
        updateSchemaAndLoadMetaType();
      }
    }

    function updateSchemaAndLoadMetaType() {
      updateSchema();
      var metaTypeMBean = getMetaTypeMBean($scope.workspace);
      var configValues = $scope.configValues;
      if (metaTypeMBean && configValues) {
        var locale = null;
        var pid = null;
        var factoryId = configValues["service.factoryPid"];
        if (factoryId) {
          pid = factoryId["Value"];
        }
        pid = pid || $scope.pid;
        $scope.jolokia.execute(metaTypeMBean, "getPidMetaTypeObject", pid, locale, onSuccess(onMetaType));
      }
      Core.$apply($scope);
    }

    function onMetaType(response) {
      $scope.metaType = response;
      updateSchema();
      Core.$apply($scope);
    }

    /**
     * Updates the JSON schema model
     */
    function updateSchema() {
      var properties = {};
      var required = [];
      $scope.defaultValues = {

      };
      var schema = {
        type: "object",
        required: required,
        properties: properties
      };
      $scope.schema = schema;
      var inputClass = "col-md-12";
      var labelClass = "control-label";

      var inputClassArray = "col-md-11";
      var labelClassArray = labelClass;

      var metaType = $scope.metaType;
      if (metaType) {
        schema["id"] = metaType.id;
        schema["name"] = metaType.name;
        schema["description"] = metaType.description;

        angular.forEach(metaType.attributes, (attribute) => {
          var id = attribute.id;
          if (isValidProperty(id)) {
            var key = encodeKey(id);
            var typeName = asJsonSchemaType(attribute.typeName, attribute.id);
            var attributeProperties = {
              title: attribute.name,
              tooltip: attribute.description,
              'input-attributes': {
                class: inputClass
              },
              'label-attributes': {
                class: labelClass
              },
              type: typeName

            };
            if (attribute.typeName === "char") {
              attributeProperties["maxLength"] = 1;
              attributeProperties["minLength"] = 1;
            }
            var cardinality = attribute.cardinality;
            if (cardinality) {
              attributeProperties.type = "array";
              attributeProperties["items"] = {
                'input-attributes': {
                  class: inputClassArray
                },
                'label-attributes': {
                  class: labelClassArray
                },
                "type": typeName
              };
            }
            if (attribute.required) {
              required.push(id);
            }
            var defaultValue = attribute.defaultValue;
            if (defaultValue) {
              if (angular.isArray(defaultValue) && defaultValue.length === 1) {
                defaultValue = defaultValue[0];
              }
              //attributeProperties["default"] = defaultValue;
              // TODO convert to boolean / number?
              $scope.defaultValues[key] = defaultValue;
            }
            var optionLabels = attribute.optionLabels;
            var optionValues = attribute.optionValues;
            if (optionLabels && optionLabels.length && optionValues && optionValues.length) {
              var enumObject = {};
              for (var i = 0; i < optionLabels.length; i++) {
                var label = optionLabels[i];
                var value = optionValues[i];
                enumObject[value] = label;
              }
              $scope.selectValues[key] = enumObject;
              Core.pathSet(attributeProperties, ['input-element'], "select");
              Core.pathSet(attributeProperties, ['input-attributes', "ng-options"], "key as value for (key, value) in selectValues." + key);
            }
            properties[key] = attributeProperties;
          }
        });
      }

      // now add all the missing properties...
      var entity = {};
      angular.forEach($scope.configValues, (value, rawKey) => {
        if (isValidProperty(rawKey)) {
          var key = encodeKey(rawKey);
          var attrValue = value;
          var attrType = "string";
          if (angular.isObject(value)) {
            attrValue = value.Value;
            attrType = asJsonSchemaType(value.Type, rawKey);
          }
          var property = properties[key];
          if (!property) {
            properties[key] = {
              'input-attributes': {
                class: inputClass
              },
              'label-attributes': {
                class: labelClass
              },
              type: attrType
            }
          } else {
            var propertyType = property["type"];
            if ("array" === propertyType) {
              if (!angular.isArray(attrValue)) {
                attrValue = attrValue ? attrValue.split(",") : [];
              }
            }
          }

          //comply with Forms.safeIdentifier in 'forms/js/formHelpers.ts'
          key = key.replace(/-/g, "_");
          entity[key] = attrValue;
        }
      });

      // add default values for missing values
      angular.forEach($scope.defaultValues, (value, key) => {
        var current = entity[key];
        if (!angular.isDefined(current)) {
          //log.info("updating entity " + key + " with default: " + value + " as was: " + current);
          entity[key] = value;
        }
      });
      //log.info("default values: " + angular.toJson($scope.defaultValues));
      $scope.entity = entity;
    }

    var ignorePropertyIds = ["service.pid", "service.factoryPid", "fabric.zookeeper.pid"];

    function isValidProperty(id) {
      return id && ignorePropertyIds.indexOf(id) < 0;
    }

    function encodeKey(key) {
      return key.replace(/\./g, "__");
    }

    function decodeKey(key) {
      return key.replace(/__/g, ".");
    }

    function asJsonSchemaType(typeName, id) {
      if (typeName) {
        var lower = typeName.toLowerCase();
        if (lower.startsWith("int") || lower === "long" || lower === "short" || lower === "byte" || lower.endsWith("int")) {
          return "integer";
        }
        if (lower === "double" || lower === "float" || lower === "bigdecimal") {
          return "number";
        }
        if (lower === "string") {
          // TODO hack to try force password type on dodgy metadata such as pax web
          if (id && id.endsWith("password")) {
            return "password";
          }
          return "string";
        }
        return typeName;
      } else {
        return "string";
      }
    }

    function updateTableContents() {
      $scope.modelLoaded = false;
      Osgi.getConfigurationProperties($scope.workspace, $scope.jolokia, $scope.pid, populateTable);
    }
  }]);
}
