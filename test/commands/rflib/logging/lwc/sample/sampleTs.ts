/* eslint-disable */
// Mock LightningElement for tests
class LightningElement {}
const api: any = () => {};

export default class SampleTs extends LightningElement {
  @api
  title: string = 'Sample Component TS';

  private data: any[] = [];
  public isEnabled: boolean = false;

  constructor() {
    super();
    this.initComponent();
  }

  connectedCallback() {
    this.loadData('init');
  }

  initComponent(): void {
    const defaultData: any = { id: 1, name: 'Default' };
    this.data.push(defaultData);
  }

  public async loadData(param: string): Promise<void> {
    try {
      const response = await fetch('/api/data?param=' + param);
      this.data = (await response.json()) as any;
    } catch (error) {
      console.error(error);
    }
  }

  handleClick(event: Event): void {
    if (this.isEnabled) {
      this.processEvent(event);
    } else {
      console.warn('Component is disabled. Ignore click.', event);
    }
  }

  private processEvent(event: any) {
    console.log('Processing event', event);
    
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, 100);
    })
    .then((result: any) => {
      console.info('Timeout done');
    })
    .catch((err: Error) => {
      console.error('Timeout error');
    })
    .finally(() => {
        console.debug('Finally block');
    });
  }

  // eslint-disable-next-line class-methods-use-this, arrow-body-style
  public arrowFunction = (val: string): string => {
      return val.toUpperCase();
  }
}
