import { LightningElement, wire } from 'lwc';

export default class IfConditionSample extends LightningElement {
    handleEvent(event) {
        if (customCheck(event.detail)) {
            console.log('checked');
        }

        if (Array.isArray(event.detail)) {
            console.log('array');
        }
    }
}

function customCheck(detail) {
    return true;
}
