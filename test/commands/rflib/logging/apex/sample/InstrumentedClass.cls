public with sharing class InstrumentedClass {
  private static final rflib_Logger MY_LOGGER = rflib_LoggerUtil.getFactory().createLogger('InstrumentedClass');

  public void doSomething() {
      System.debug('test');
  }
}