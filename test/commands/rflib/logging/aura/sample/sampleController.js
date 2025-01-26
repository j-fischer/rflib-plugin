({
  handleClick: function(component, event, helper) {
      try {
          helper.loadData(component);
      } catch(error) {
          console.error(error);
      }
  },
  
  testIfInstrumentation: function(component, event, helper) {
      var data = event.getParam('data')
      if (data.isValid)
        component.set("v.value", data.value);
      else 
        component.set("v.value", null);
  }
})