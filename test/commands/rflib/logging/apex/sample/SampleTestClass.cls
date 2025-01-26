@IsTest
public class SampleTestClass {
    
    @TestSetup
    static void setupTestData() {
        Account acc = new Account(Name = 'Test');
        insert acc;
    }
    
    @IsTest
    static void testMethod1() {
        Test.startTest();
        List<Account> accounts = [SELECT Id FROM Account];
        System.assertEquals(1, accounts.size());
        Test.stopTest();
    }
}