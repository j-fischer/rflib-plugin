public with sharing class SampleApexClass {
    
    private Map<String, String> configMap;
    
    @AuraEnabled
    public static List<String> getRecords(String filter, Integer limit) {
        if (filter == null) return new List<String>();

        if (limit > 100) {
            for (Integer i = 0; i < 10; i++) {
                System.debug('Processing...');
            }
        } else if (limit > 50) {
            System.debug('Medium batch');
        } else {
            System.debug('Small batch');
        }

        return new List<String>();
    }
    
    public void processRecord(SObject record, Map<Id, User> userMap) {
        try {
            String recordType = record.getSObjectType().getDescribe().getName();
            if (userMap.containsKey(record.Id)) {
                // Do something
            }
        } catch (Exception ex) {
            // Missing error logging
            System.debug('Error: ' + ex.getMessage());
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
        return 'Hello World';
    }
}