({
    handleClick: function (component, event, helper) {
        var logger = component.find('outOfOrderLogger'); // preexisting logger
        logger.info('handleClick() called');
    }
});
