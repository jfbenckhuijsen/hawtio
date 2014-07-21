
module UI {

  /**
   * Directive wrapping angular-ui/bootstrap's $modal service.
   * The modal-window directive isn't that functional as "modal" directive from version 0.4.0
   */
  _module.directive('modal', ['$parse', '$modal', function($parse, $modal) {
    return {
      restrict: 'A',
      terminal: true,
      link: function(scope, elm, attrs) {
        var opts = angular.extend({}, scope.$eval(attrs.uiOptions || attrs.bsOptions || attrs.options));
        var shownExpr = attrs.modal || attrs.show;
        var setClosed;

        // Create a dialog with the template as the contents of the directive
        // Add the current scope as the resolve in order to make the directive scope as a dialog controller scope
        opts = angular.extend(opts, {
          template: elm.html(),
          // explicit scope proprty will make dialog's controller scope a child of provided scope
          // by default it would be child of $rootScope
          scope: scope
        });

        elm.remove();

        if (attrs.close) {
          setClosed = function() {
            $parse(attrs.close)(scope);
          };
        } else {
          setClosed = function() {
            if (angular.isFunction($parse(shownExpr).assign)) {
              $parse(shownExpr).assign(scope, false);
            }
          };
        }

        var dialog;
        scope.$watch(shownExpr, function(isShown, oldShown) {
          if (isShown) {
            dialog = $modal.open(opts);
            dialog.result.then(setClosed, setClosed);
          } else {
            // Make sure it is not opened
            // see: https://github.com/angular-ui/bootstrap/pull/1972
            if (dialog) {
              dialog.close("OK");
            }
          }
        });
      }
    };
  }]);

}
