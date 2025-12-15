public with sharing class SampleApexClass {
    
    private Map<String, String> configMap;
    
    @AuraEnabled
    public static List<String> getRecords(String filter, Integer someLimit) {
        if (filter == null) return new List<String>();

        if (someLimit > 100) {
            for (Integer i = 0; i < 10; i++) {
                System.debug(LoggingLevel.FINE, 'Processing...');
            }
        } else if (someLimit > 50) {
            System.debug(LoggingLevel.WARN, 'Medium batch');
        } else {
            System.debug('Small batch');
        }

        return new List<String>();
    }
    
    public void processRecord(SObject record, Map<Id, User> userMap) {
        try {
            String recordType = record.getSObjectType().getDescribe().getName();
            if (userMap.containsKey(record.Id)) {
                System.debug(LoggingLevel.INFO, 'User found: ' + userMap.get(record.Id));
            }
        } catch (Exception ex) {
            // Missing error logging
            System.debug(LoggingLevel.ERROR, 'Error: ' + ex.getMessage());
        }
    }
    
    private Map<String, Object> complexOperation(
        List<Account> accounts, 
        Map<Id, Contact> contactMap, 
        Set<String> filters
    ) {
        Map<String, Object> result = new Map<String, Object>();
        try {
            for (Account acc : accounts) {
                // Some complex logic
                result.put(acc.Id, contactMap.get(acc.Id));
            }
        } catch (Exception e) {
            // Missing error logging
            throw e;
        }
        return result;
    }
    
    public static String simpleMethod() {
        if (configMap != null)
            return configMap.get('key');
        else 
            return 'Hello World';
    }
}
