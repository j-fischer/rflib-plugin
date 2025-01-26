({
  handleClick: function(component, event, helper) {
      var logger = component.find('logger');
      logger.info('handleClick invoked');
      try {
          helper.loadData(component);
      } catch(error) {
          console.error(error);
      }
  },
  
  testIfInstrumentationWithCustomLoggerVar: function(component, event, helper) {
    var customLogger = component.find('logger'); 
    customLogger.info('testIfInstrumentation invoked');

    var data = event.getParam('data');
    if (data.isValid) {
      component.set("v.value", data.value);
    } else { 
      component.set("v.value", null);
    }
  }
})