({
  loadData: function (component, params) {
    var action = component.get('c.getData');
    action.setParams(params);
    action.setCallback(this, function (response) {
      if (response.getState() === 'SUCCESS') {
        component.set('v.value', response.getReturnValue());
      }
    });
    $A.enqueueAction(action);
  },

  promiseMethod: function (component, params) {
    return new Promise(function (resolve, reject) {
      var action = component.get('c.getData');
      action.setParams(params);
      action.setCallback(this, function (response) {
        console.log('console log message in callback');
        if (response.getState() === 'SUCCESS') {
          resolve(response.getReturnValue());
        } else {
          reject(response.getError());
        }
      });
      $A.enqueueAction(action);
    })
      .then(function (data) {
        console.log('Promise resolved: ' + data);
        return data;
      })
      .catch(function (error) {
        console.error('Promise rejected: ' + error);
        throw error;
      })
      .finally(function () {
        console.log('Promise finally');
      });
  },

  testConsoleLogReplacementWithExistingLoggerVar: function (component, event, helper) {
    var myLogger = component.find('logger');
    myLogger.info('testConsoleLogReplacementWithExistingLoggerVar() invoked');

    console.log('This is a console.log message');
  },
});
