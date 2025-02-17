import { LightningElement } from 'lwc';

import { createLogger } from 'c/rflibLogger';

export default class SampleComponent extends LightningElement {
  isEnabled = false;
  loading = false;
  disabled = false;
  data = null;

  logger = createLogger('MyModule');

  async handleClick(event) {
    this.logger.info('handleClick: {0}', event);
    try {
      const result = await this.loadData();
      this.processResult(result);
    } catch (error) {
      console.error(error);
    }
  }

  handleEvent(event) {
    if (disabled) return;

    if (this.isEnabled) {
      this.processEvent(event);
      if (this.loading) {
        if (this.data) {
          this.updateData();
        }
      }
    } else {
      this.handleError();
    }
  }

  loadData() {
    return fetch('/api/data')
      .then((response) => response.json())
      .catch((error) => {
        console.error(error);
      });
  }

  setTitle() {
    getCustomSettingLabel({ customSettingsApiName: this.customSettingsApiName })
      .then((label) => {
        this.title = `${label} Editor`;
      })
      .catch((error) => {
        this.title = 'Custom Settings Editor';
      });
  }

  checkUserPermissions() {
    return canUserModifyCustomSettings({ customSettingsApiName: this.customSettingsApiName })
      .then((result) => {
        this.canModifySettings = result;
      }) // checkUserPermissions must complete before the settings are loaded
      .finally(() => this.loadCustomSettings());
  }
}
