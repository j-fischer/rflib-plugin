({
  loadData: function(component, params) {
      var action = component.get('c.serverAction');
      action.setParams(params);
      action.setCallback(this, function(response) {
          if (response.getState() === "SUCCESS") {
              component.set('v.value', response.getReturnValue());
          }
      });
      $A.enqueueAction(action);
  }
})