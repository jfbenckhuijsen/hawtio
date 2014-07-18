/**
 * @module Wiki
 */
/// <reference path="./wikiPlugin.ts"/>
module Wiki {

  function goToLink(link, $timeout, $location) {
    var href = Core.trimLeading(link, "#");
    $timeout(() => {
      log.debug("About to navigate to: " + href);
      $location.url(href);
    }, 100);
  }

  _module.controller("Wiki.ViewController", ["$scope", "$location", "$routeParams", "$route", "$http", "$timeout", "workspace", "marked", "fileExtensionTypeRegistry", "wikiRepository", "$compile", "$templateCache", "jolokia", ($scope, $location, $routeParams, $route, $http, $timeout, workspace:Workspace, marked, fileExtensionTypeRegistry, wikiRepository:GitWikiRepository, $compile, $templateCache, jolokia) => {

    Wiki.initScope($scope, $routeParams, $location);

    $scope.fabricTopLevel = "fabric/profiles/";

    $scope.versionId = $scope.branch;

    $scope.paneTemplate = '';

    $scope.profileId = Fabric.pagePathToProfileId($scope.pageId);
    $scope.showProfileHeader = $scope.profileId && $scope.pageId.endsWith(Fabric.profileSuffix) ? true : false;

    $scope.operationCounter = 1;
    $scope.addDialog = new UI.Dialog();
    $scope.generateDialog = new UI.Dialog();
    $scope.renameDialog = new UI.Dialog();
    $scope.moveDialog = new UI.Dialog();
    $scope.deleteDialog = new UI.Dialog();
    $scope.isFile = false;
    $scope.rename = {
      newFileName: ""
    };
    $scope.move = {
      moveFolder: ""
    }
    $scope.createDocumentTree = Wiki.createWizardTree(workspace, $scope);

    $scope.createDocumentTreeActivations = ["camel-spring.xml", "ReadMe.md"];
    $scope.fileExists = {
      exists: false,
      name: ""
    };

    // bind filter model values to search params...
    Core.bindModelToSearchParam($scope, $location, "searchText", "q", "");

    // only reload the page if certain search parameters change
    Core.reloadWhenParametersChange($route, $scope, $location);

    $scope.gridOptions = {
      data: 'children',
      displayFooter: false,
      selectedItems: [],
      showSelectionCheckbox: true,
      enableSorting: false,
      useExternalSorting: true,
      columnDefs: [
        {
          field: 'name',
          displayName: 'Name',
          cellTemplate: $templateCache.get('fileCellTemplate.html'),
          headerCellTemplate: $templateCache.get('fileColumnTemplate.html')
        }
      ]
    };

    $scope.childActions = [];

    var maybeUpdateView = Core.throttled(updateView, 1000);


    $scope.$on('wikiBranchesUpdated', function () {
      updateView();
    });

    /*
     if (!$scope.nameOnly) {
     $scope.gridOptions.columnDefs.push({
     field: 'lastModified',
     displayName: 'Modified',
     cellFilter: "date:'EEE, MMM d, y : hh:mm:ss a'"
     });
     $scope.gridOptions.columnDefs.push({
     field: 'length',
     displayName: 'Size',
     cellFilter: "number"
     });
     }
     */

    $scope.createDashboardLink = () => {
      var href = '/wiki/branch/:branch/view/*page';
      var page = $routeParams['page'];
      var title = page ? page.split("/").last() : null;
      var size = angular.toJson({
        size_x: 2,
        size_y: 2
      });
      var answer = "#/dashboard/add?tab=dashboard" +
        "&href=" + encodeURIComponent(href) +
        "&size=" + encodeURIComponent(size) +
        "&routeParams=" + encodeURIComponent(angular.toJson($routeParams));
      if (title) {
        answer += "&title=" + encodeURIComponent(title);
      }
      return answer;
    };

    $scope.displayClass = () => {
      if (!$scope.children || $scope.children.length === 0) {
        return "";
      }
      return "col-md-9";
    };

    $scope.parentLink = () => {
      var start = startLink($scope.branch);
      var prefix = start + "/view";
      //log.debug("pageId: ", $scope.pageId)
      var parts = $scope.pageId.split("/");
      //log.debug("parts: ", parts);
      var path = "/" + parts.first(parts.length - 1).join("/");
      //log.debug("path: ", path);
      return Core.createHref($location, prefix + path, []);
    };


    $scope.childLink = (child) => {
      var start = startLink($scope.branch);
      var prefix = start + "/view";
      var postFix = "";
      var path = Wiki.encodePath(child.path);
      if (child.directory) {
        // if we are a folder with the same name as a form file, lets add a form param...
        var formPath = path + ".form";
        var children = $scope.children;
        if (children) {
          var formFile = children.find((child) => {
            return child['path'] === formPath;
          });
          if (formFile) {
            prefix = start + "/formTable";
            postFix = "?form=" + formPath;
          }
        }
      } else {
        var xmlNamespaces = child.xmlNamespaces;
        if (xmlNamespaces && xmlNamespaces.length) {
          if (xmlNamespaces.any((ns) => Wiki.camelNamespaces.any(ns))) {
            prefix = start + "/camel/canvas";
          } else if (xmlNamespaces.any((ns) => Wiki.dozerNamespaces.any(ns))) {
            prefix = start + "/dozer/mappings";
          } else {
            log.debug("child " + path + " has namespaces " + xmlNamespaces);
          }
        }
        if (child.path.endsWith(".form")) {
          postFix = "?form=/";
        } else if (Wiki.isIndexPage(child.path)) {
          // lets default to book view on index pages
          prefix = start + "/book";
        }
      }
      return Core.createHref($location, prefix + path + postFix, ["form"]);
    };

    $scope.fileName = (entity) => {
      return Wiki.hideFineNameExtensions(entity.name);
    };

    $scope.fileClass = (entity) => {
      if (entity.name.has(".profile")) {
        return "green";
      }
      return "";
    };

    $scope.fileIconHtml = (entity) => {
      return Wiki.fileIconHtml(entity);
    };


    $scope.format = Wiki.fileFormat($scope.pageId, fileExtensionTypeRegistry);
    var options = {
      readOnly: true,
      mode: {
        name: $scope.format
      }
    };
    $scope.codeMirrorOptions = CodeEditor.createEditorSettings(options);

    $scope.editLink = () => {
      var pageName = ($scope.directory) ? $scope.readMePath : $scope.pageId;
      return (pageName) ? Wiki.editLink($scope.branch, pageName, $location) : null;
    };

    $scope.branchLink = (branch) => {
      if (branch) {
        return Wiki.branchLink(branch, $scope.pageId, $location);
      }
      return null
    };

    $scope.historyLink = "#/wiki" + ($scope.branch ? "/branch/" + $scope.branch : "") + "/history/" + $scope.pageId;

    $scope.$watch('workspace.tree', function () {
      if (!$scope.git && Git.getGitMBean(workspace)) {
        // lets do this asynchronously to avoid Error: $digest already in progress
        //log.info("Reloading view as the tree changed and we have a git mbean now");
        setTimeout(maybeUpdateView, 50);
      }
    });

    /*
     // TODO this doesn't work for some reason!
     $scope.$on('jmxTreeUpdated', function () {
     log.debug("view: jmx tree updated!");
     });
     */

    $scope.$on("$routeChangeSuccess", function (event, current, previous) {
      // lets do this asynchronously to avoid Error: $digest already in progress
      //log.info("Reloading view due to $routeChangeSuccess");
      setTimeout(maybeUpdateView, 50);
    });

    $scope.onSubmit = (json, form) => {
      Core.notification("success", "Submitted form :" + form.get(0).name + " data: " + JSON.stringify(json));
    };

    $scope.onCancel = (form) => {
      Core.notification("success", "Clicked cancel!");
    };


    $scope.onCreateDocumentSelect = (node) => {
      $scope.selectedCreateDocumentTemplate = node ? node.entity : null;
      $scope.selectedCreateDocumentTemplateRegex = $scope.selectedCreateDocumentTemplate.regex || /.*/;
      checkFileExists(getNewDocumentPath());
    };

    $scope.$watch("newDocumentName", () => {
      checkFileExists(getNewDocumentPath());
    });

    $scope.openAddDialog = () => {
      $scope.newDocumentName = null;
      $scope.addDialog.open();
    };

    $scope.addAndCloseDialog = (fileName:string) => {
      $scope.newDocumentName = fileName;
      var template = $scope.selectedCreateDocumentTemplate;
      var path = getNewDocumentPath();
      if (!template || !path) {
        return;
      }
      var name = Wiki.fileName(path);
      var fileName:string = name;
      var folder = Wiki.fileParent(path);
      var exemplar = template.exemplar;

      var commitMessage = "Created " + template.label;
      var exemplarUri = Core.url("/app/wiki/exemplar/" + exemplar);

      if (template.folder) {
        Core.notification("success", "Creating new folder " + name);

        wikiRepository.createDirectory($scope.branch, path, commitMessage, (status) => {
          $scope.addDialog.close();
          Core.$apply($scope);
          var link = Wiki.viewLink($scope.branch, path, $location);
          goToLink(link, $timeout, $location);
        });
      } else if (template.profile) {

        function toPath(profileName:string) {
          var answer = "fabric/profiles/" + profileName;
          answer = answer.replace(/-/g, "/");
          answer = answer + ".profile";
          return answer;
        }

        function toProfileName(path:string) {
          var answer = path.replace(/^fabric\/profiles\//, "");
          answer = answer.replace(/\//g, "-");
          answer = answer.replace(/\.profile$/, "");
          return answer;
        }

        // strip off any profile name in case the user creates a profile while looking at
        // another profile
        folder = folder.replace(/\/=?(\w*)\.profile$/, "");

        var concatenated = folder + "/" + name;

        var profileName = toProfileName(concatenated);
        var targetPath = toPath(profileName);

        $scope.addDialog.close();

        Fabric.createProfile(workspace.jolokia, $scope.branch, profileName, ['default'], () => {

          // notification('success', 'Created profile ' + profileName);
          Core.$apply($scope);

          Fabric.newConfigFile(workspace.jolokia, $scope.branch, profileName, 'ReadMe.md', () => {

            // notification('info', 'Created empty Readme.md in profile ' + profileName);
            Core.$apply($scope);

            var contents = "Here's an empty ReadMe.md for '" + profileName + "', please update!";

            Fabric.saveConfigFile(workspace.jolokia, $scope.branch, profileName, 'ReadMe.md', contents.encodeBase64(), () => {
              // notification('info', 'Updated Readme.md in profile ' + profileName);
              Core.$apply($scope);
              var link = Wiki.viewLink($scope.branch, targetPath, $location);
              goToLink(link, $timeout, $location);
            }, (response) => {
              Core.notification('error', 'Failed to set ReadMe.md data in profile ' + profileName + ' due to ' + response.error);
              Core.$apply($scope);
            });
          }, (response) => {
            Core.notification('error', 'Failed to create ReadMe.md in profile ' + profileName + ' due to ' + response.error);
            Core.$apply($scope);
          });

        }, (response) => {
          Core.notification('error', 'Failed to create profile ' + profileName + ' due to ' + response.error);
          Core.$apply($scope);
        })

      } else if (template.generated) {

        $scope.addDialog.close();

        var generateDialog = $scope.generateDialog
        $scope.formSchema = template.generated.schema
        $scope.formData = template.generated.form(workspace, $scope);
        $scope.generate = function () {
          template.generated.generate(workspace, $scope.formData, (contents)=> {
            generateDialog.close();
            wikiRepository.putPageBase64($scope.branch, path, contents, commitMessage, (status) => {
              log.debug("Created file " + name);
              Wiki.onComplete(status);
              $scope.generateDialog.close();
              updateView();
            });
          }, (error)=> {
            generateDialog.close();
            Core.notification('error', error);
          });
        };
        generateDialog.open();

      } else {
        // notification("success", "Creating new document " + name);

        $http.get(exemplarUri).success((contents) => {

          // TODO lets check this page does not exist - if it does lets keep adding a new post fix...
          wikiRepository.putPage($scope.branch, path, contents, commitMessage, (status) => {
            log.debug("Created file " + name);
            Wiki.onComplete(status);

            // lets navigate to the edit link
            // load the directory and find the child item
            $scope.git = wikiRepository.getPage($scope.branch, folder, $scope.objectId, (details) => {
              // lets find the child entry so we can calculate its correct edit link
              var link = null;
              if (details && details.children) {
                log.debug("scanned the directory " + details.children.length + " children");
                var child = details.children.find(c => c.name === fileName);
                if (child) {
                  link = $scope.childLink(child);
                } else {
                  log.debug("Could not find name '" + fileName + "' in the list of file names " + JSON.stringify(details.children.map(c => c.name)));
                }
              }
              if (!link) {
                log.debug("WARNING: could not find the childLink so reverting to the wiki edit page!");
                link = Wiki.editLink($scope.branch, path, $location);
              }
              $scope.addDialog.close();
              Core.$apply($scope);
              goToLink(link, $timeout, $location);
            });
          });
        });
      }
      $scope.addDialog.close();
    };


    $scope.openDeleteDialog = () => {
      if ($scope.gridOptions.selectedItems.length) {
        $scope.selectedFileHtml = "<ul>" + $scope.gridOptions.selectedItems.map(file => "<li>" + file.name + "</li>").sort().join("") + "</ul>";
        $scope.deleteDialog.open();
      } else {
        log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
      }
    };

    $scope.deleteAndCloseDialog = () => {
      var files = $scope.gridOptions.selectedItems;
      var fileCount = files.length;
      log.debug("Deleting selection: " + files);
      angular.forEach(files, (file, idx) => {
        var path = $scope.pageId + "/" + file.name;
        log.debug("About to delete " + path);
        $scope.git = wikiRepository.removePage($scope.branch, path, null, (result) => {
          if (idx + 1 === fileCount) {
            $scope.gridOptions.selectedItems.splice(0, fileCount);
            var message = Core.maybePlural(fileCount, "document");
            Core.notification("success", "Deleted " + message);
            Core.$apply($scope);
            updateView();
          }
        });
      });
      $scope.deleteDialog.close();
    };

    $scope.$watch("rename.newFileName", () => {
      // ignore errors if the file is the same as the rename file!
      var path = getRenameFilePath();
      if ($scope.originalRenameFilePath === path) {
        $scope.fileExists = { exsits: false, name: null };
      } else {
        checkFileExists(path);
      }
    });

    $scope.openRenameDialog = () => {
      var name = null;
      if ($scope.gridOptions.selectedItems.length) {
        var selected = $scope.gridOptions.selectedItems[0];
        name = selected.name;
      }
      if (name) {
        $scope.rename.newFileName = name;
        $scope.originalRenameFilePath = getRenameFilePath();
        $scope.renameDialog.open();
        $timeout(() => {
          $('#renameFileName').focus();
        }, 50);
      } else {
        log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
      }
    };

    $scope.renameAndCloseDialog = () => {
      if ($scope.gridOptions.selectedItems.length) {
        var selected = $scope.gridOptions.selectedItems[0];
        var newPath = getRenameFilePath();
        if (selected && newPath) {
          var oldName = selected.name;
          var newName = Wiki.fileName(newPath);
          var oldPath = $scope.pageId + "/" + oldName;
          log.debug("About to rename file " + oldPath + " to " + newPath);
          $scope.git = wikiRepository.rename($scope.branch, oldPath, newPath, null, (result) => {
            Core.notification("success", "Renamed file to  " + newName);
            $scope.gridOptions.selectedItems.splice(0, 1);
            $scope.renameDialog.close();
            Core.$apply($scope);
            updateView();
          });
        }
      }
      $scope.renameDialog.close();
    };

    $scope.openMoveDialog = () => {
      if ($scope.gridOptions.selectedItems.length) {
        $scope.move.moveFolder = $scope.pageId;
        $scope.moveDialog.open();
        $timeout(() => {
          $('#moveFolder').focus();
        }, 50);
      } else {
        log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
      }
    };

    $scope.moveAndCloseDialog = () => {
      var files = $scope.gridOptions.selectedItems;
      var fileCount = files.length;
      var moveFolder = $scope.move.moveFolder;
      var oldFolder = $scope.pageId;
      if (moveFolder && fileCount && moveFolder !== oldFolder) {
        log.debug("Moving " + fileCount + " file(s) to " + moveFolder);
        angular.forEach(files, (file, idx) => {
          var oldPath = oldFolder + "/" + file.name;
          var newPath = moveFolder + "/" + file.name;
          log.debug("About to move " + oldPath + " to " + newPath);
          $scope.git = wikiRepository.rename($scope.branch, oldPath, newPath, null, (result) => {
            if (idx + 1 === fileCount) {
              $scope.gridOptions.selectedItems.splice(0, fileCount);
              var message = Core.maybePlural(fileCount, "document");
              Core.notification("success", "Moved " + message + " to " + newPath);
              $scope.moveDialog.close();
              Core.$apply($scope);
              updateView();
            }
          });
        });
      }
      $scope.moveDialog.close();
    };

    $scope.folderNames = (text) => {
      return wikiRepository.completePath($scope.branch, text, true, null);
    };

    setTimeout(maybeUpdateView, 50);

    function isDiffView() {
      var path = $location.path();
      return path && (path.startsWith("/wiki/diff") || path.startsWith("/wiki/branch/" + $scope.branch + "/diff"));
    }

    function updateView() {
      if (isDiffView()) {
        var baseObjectId = $routeParams["baseObjectId"];
        $scope.git = wikiRepository.diff($scope.objectId, baseObjectId, $scope.pageId, onFileDetails);
      } else {
        $scope.git = wikiRepository.getPage($scope.branch, $scope.pageId, $scope.objectId, onFileDetails);
      }
      Wiki.loadBranches(wikiRepository, $scope);
    }

    $scope.updateView = updateView;

    function viewContents(pageName, contents) {
      $scope.sourceView = null;

      var format:string = null;
      if (isDiffView()) {
        format = "diff";
      } else {
        format = Wiki.fileFormat(pageName, fileExtensionTypeRegistry) || $scope.format;
      }
      if ("markdown" === format) {
        // lets convert it to HTML
        $scope.html = contents ? marked(contents) : "";
        $scope.html = $compile($scope.html)($scope);
      } else if (format && format.startsWith("html")) {
        $scope.html = contents;
        $compile($scope.html)($scope);
      } else {
        var form = null;
        if (format && format === "javascript") {
          form = $location.search()["form"];
        }
        $scope.source = contents;
        $scope.form = form;
        if (form) {
          // now lets try load the form JSON so we can then render the form
          $scope.sourceView = null;
          if (form === "/") {
            onFormSchema(_jsonSchema);
          } else {
            $scope.git = wikiRepository.getPage($scope.branch, form, $scope.objectId, (details) => {
              onFormSchema(Wiki.parseJson(details.text));
            });
          }
        } else {
          $scope.sourceView = "app/wiki/html/sourceView.html";
        }
      }
      Core.$apply($scope);
    }

    function onFormSchema(json) {
      $scope.formDefinition = json;
      if ($scope.source) {
        $scope.formEntity = Wiki.parseJson($scope.source);
      }
      $scope.sourceView = "app/wiki/html/formView.html";
      Core.$apply($scope);
    }

    function onFileDetails(details) {
      var contents = details.text;
      $scope.directory = details.directory;

      if (details && details.format) {
        $scope.format = details.format;
      } else {
        $scope.format = Wiki.fileFormat($scope.pageId, fileExtensionTypeRegistry);
      }
      $scope.codeMirrorOptions.mode.name = $scope.format;
      //log.debug("format is '" + $scope.format + "'");

      $scope.children = null;

      if (details.directory) {

        var directories = details.children.filter((dir) => {
          return dir.directory && !dir.name.has(".profile")
        });
        var profiles = details.children.filter((dir) => {
          return dir.directory && dir.name.has(".profile")
        });
        var files = details.children.filter((file) => {
          return !file.directory;
        });

        directories = directories.sortBy((dir) => {
          return dir.name;
        });
        profiles = profiles.sortBy((dir) => {
          return dir.name;
        });

        files = files.sortBy((file) => {
          return file.name;
        })
          .sortBy((file) => {
            return file.name.split('.').last();
          });


        $scope.children = (<any>Array).create(directories, profiles, files);
      }


      $scope.html = null;
      $scope.source = null;
      $scope.readMePath = null;

      $scope.isFile = false;
      if ($scope.children) {
        $scope.$broadcast('pane.open');
        // if we have a readme then lets render it...
        var item = $scope.children.find((info) => {
          var name = (info.name || "").toLowerCase();
          var ext = fileExtension(name);
          return name && ext && ((name.startsWith("readme.") || name === "readme") || (name.startsWith("index.") || name === "index"));
        });
        if (item) {
          var pageName = item.path;
          $scope.readMePath = pageName;
          wikiRepository.getPage($scope.branch, pageName, $scope.objectId, (readmeDetails) => {
            viewContents(pageName, readmeDetails.text);
          });
        }
      } else {
        $scope.$broadcast('pane.close');
        var pageName = $scope.pageId;
        viewContents(pageName, contents);
        $scope.isFile = true;
      }
      Core.$apply($scope);
    }

    function checkFileExists(path) {
      $scope.operationCounter += 1;
      var counter = $scope.operationCounter;
      if (path) {
        wikiRepository.exists($scope.branch, path, (result) => {
          // filter old results
          if ($scope.operationCounter === counter) {
            log.debug("for path " + path + " got result " + result);
            $scope.fileExists.exists = result ? true : false;
            $scope.fileExists.name = result ? result.name : null;
            Core.$apply($scope);
          } else {
            // log.debug("Ignoring old results for " + path);
          }
        });
      }
    }

    // Called by hawtio TOC directive...
    $scope.getContents = (filename, cb) => {
      var pageId = filename;
      if ($scope.directory) {
        pageId = $scope.pageId + '/' + filename;
      } else {
        var pathParts = $scope.pageId.split('/');
        pathParts = pathParts.remove(pathParts.last());
        pathParts.push(filename);
        pageId = pathParts.join('/');
      }
      log.debug("pageId: ", $scope.pageId);
      log.debug("branch: ", $scope.branch);
      log.debug("filename: ", filename);
      log.debug("using pageId: ", pageId);
      wikiRepository.getPage($scope.branch, pageId, undefined, (data) => {
        cb(data.text);
      });
    };

    function getNewDocumentPath() {
      var template = $scope.selectedCreateDocumentTemplate;
      if (!template) {
        log.debug("No template selected.");
        return null;
      }
      var exemplar = template.exemplar || "";
      var name = $scope.newDocumentName || exemplar;

      if (name.indexOf('.') < 0) {
        // lets add the file extension from the exemplar
        var idx = exemplar.lastIndexOf(".");
        if (idx > 0) {
          name += exemplar.substring(idx);
        }
      }

      // lets deal with directories in the name
      var folder = $scope.pageId;
      if ($scope.isFile) {
        // if we are a file lets discard the last part of the path
        var idx = folder.lastIndexOf("/");
        if (idx <= 0) {
          folder = "";
        } else {
          folder = folder.substring(0, idx);
        }
      }
      var fileName = name;
      var idx = name.lastIndexOf("/");
      if (idx > 0) {
        folder += "/" + name.substring(0, idx);
        name = name.substring(idx + 1);
      }
      folder = Core.trimLeading(folder, "/");
      return folder + (folder ? "/" : "") + name;
    }

    function getRenameFilePath() {
      var newFileName = $scope.rename.newFileName;
      return ($scope.pageId && newFileName) ? $scope.pageId + "/" + newFileName : null;
    }
  }]);
}
