import { Subscription } from 'rxjs';
import { FormGroup,FormControl,FormsModule,ReactiveFormsModule } from '@angular/forms';
import {Component, OnInit, OnDestroy, NgModule} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod,
  Entity, PageInfo, RestErrorResponse, AlertService,EntityType,
  CloudAppSettingsService,CloudAppConfigService
} from '@exlibris/exl-cloudapp-angular-lib';

interface Mmsid {
  value?:string;
  link?:string;
}

interface ResourceMetadata {
  title?:string;
  author?:string;
  issn?:string;
  isbn?:string;
  publisher?:string;
  publication_place?:string;
  publication_year?:string;
  vendor_title_number?:string;
  mms_id?:Mmsid;
}

interface Fund {
  code:string;
  name:string
}

interface Vendor {
  code:string;
  name:string
}

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
@NgModule({
  imports:[
    FormsModule
  ]
})
export class MainComponent implements OnInit, OnDestroy {

  private pageLoad$: Subscription;
  pageEntities: Entity[];
  private _apiResult: any;
  poLineInfo:any =  {
    currency:'',
    fund:'',
    vendor:''
  };
  price='';
  currency: FormControl = new FormControl('');
  resourceMetadata: ResourceMetadata = {};
  hasApiResult: boolean = false;
  loading = false;
  funds:Fund[];
  vendors:Vendor[];
  currencyCode = [{
    value:'CAD',
    desc:'Canadian Dollar'
  },{
    value:'GBP',
    desc:'Pound Sterling'
  },{
    value:'AUD',
    desc:'Australian Dollar'
  },{
    value:'USD',
    desc:'US Dollar'
  },{
    value:'EUR',
    desc:'Euro'
  },{
    value:'CNY',
    desc:'Yuan Renminbi'
  }];
  settings:any = null;
  constructor(private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private translate: TranslateService,
    private alert: AlertService) { }

  ngOnInit() {
    this.eventsService.getInitData().subscribe(data=> {
      this.settings = data
      this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    });

  }

  ngOnDestroy(): void {
    this.pageLoad$.unsubscribe();
  }

  get apiResult() {
    return this._apiResult;
  }

  set apiResult(result: any) {
    this._apiResult = result;
    this.hasApiResult = result && Object.keys(result).length > 0;
  }

  onPageLoad = (pageInfo: PageInfo) => {
    this.pageEntities = pageInfo.entities;
    if ((pageInfo.entities || []).length == 1) {
      const entity = pageInfo.entities[0];
      if(entity.type === EntityType.PO_LINE) {
        this.restService.call(entity.link).subscribe(result => {

          if(result && result.resource_metadata) {
            this.apiResult = result
            this.resourceMetadata = result.resource_metadata
            this.price = result.price.sum
            this.poLineInfo = {
              currency:result.price.currency.value,
              fund:result.fund_distribution[0].fund_code.value,
              vendor:result.vendor.value
            }
          }

        });
        this.getFunds(this.settings.instCode)
        this.getVendors(this.settings.instCode)
      }

    } else {
      this.apiResult = null;
      this.resourceMetadata = {}
    }
  }
  updatePrice(value:any) {
    let requestBody = this.tryParseJson(value);
    requestBody.price.sum = this.price;
    requestBody.fund_distribution.amount = this.price;
    this.sendUpdateRequest(requestBody);
  }
  update(value: any) {
    let currencyIndex = this.currencyCode.findIndex((item)=>{
      return this.poLineInfo.currency===item.value
    })
    let fundsIndex = this.funds.findIndex((item)=>{
      return this.poLineInfo.fund===item.code
    })
    let vendorsIndex = this.vendors.findIndex((item)=>{
      return this.poLineInfo.vendor===item.code
    })
    let requestBody = this.tryParseJson(value);
    console.log(requestBody)
    let status = requestBody.status.value
    requestBody.status = {
      "value": "AUTO_PACKAGING",
      "desc": "Auto Packaging"
    }
    requestBody.status = {
      "value": "SENT",
        "desc": "Sent"
    }
    if(currencyIndex>-1) {
      requestBody.price.currency = this.currencyCode[currencyIndex]
      requestBody.fund_distribution.forEach(item=>{
        if(item.amount && item.amount.currency) {
          item.amount.currency = this.currencyCode[currencyIndex]
        }
      })
    }
    if(vendorsIndex>-1) {
      requestBody.vendor.value = this.vendors[vendorsIndex].code
      requestBody.vendor.desc = this.vendors[vendorsIndex].name
      requestBody.vendor_account = this.vendors[vendorsIndex].code
    }

    if(fundsIndex>-1) {
      requestBody.fund_distribution.forEach(item=>{
        item.fund_code.value = this.funds[fundsIndex].code
        item.fund_code.desc = this.funds[fundsIndex].name
      })
    }

    console.log(requestBody)

    // this.loading = true;
    // let requestBody = this.tryParseJson(value);
    // if (!requestBody) {
    //   this.loading = false;
    //   return this.alert.error('Failed to parse json');
    // }
    // this.alert.success(this.translate.instant('i18n.UpdateSuccess',{number:"111"}));
    if(window.confirm(this.translate.instant('i18n.UpdateConfirm'))) {
      this.sendDeleteRequest(requestBody,status);
    }

  }

  refreshPage = () => {
    this.loading = true;
    this.eventsService.refreshPage().subscribe({
      next: () => this.alert.success('Success!'),
      error: e => {
        console.error(e);
        this.alert.error('Failed to refresh page');
      },
      complete: () => this.loading = false
    });
  }
  private sendDeleteRequest(requestBody: any,status:any) {
    let request: Request = {
      url: this.pageEntities[0].link+"?reason=LIBRARY_CANCELLED",
      method: HttpMethod.DELETE
    };
    if(status==="CANCELLED") {
      this.sendCreateRequest(requestBody);
    }else{
      this.restService.call(request).subscribe({
        next: result => {
          this.sendCreateRequest(requestBody);
          // this.apiResult = result;
          // this.refreshPage();
        },
        error: (e: RestErrorResponse) => {
          this.alert.error('Failed to update data');
          console.error(e);
          this.loading = false;
        }
      });
    }

  }
  private getVendors(library:any) {
    let request: Request = {
      url: '/almaws/v1/acq/vendors?limit=100&status=active',
      method: HttpMethod.GET
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.vendors = result.vendor;
      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to update data');
        console.error(e);
        this.loading = false;
      }
    });
  }

  private getFunds(library:any) {
    let request: Request = {
      url: '/almaws/v1/acq/funds?limit=100&library='+library,
      method: HttpMethod.GET
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.funds = result.fund;

      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to update data');
        console.error(e);
        this.loading = false;
      }
    });


  }
  private sendCreateRequest(requestBody:any) {
    delete requestBody.number
    delete requestBody.po_number
    let request: Request = {
      url: '/almaws/v1/acq/po-lines',
      method: HttpMethod.POST,
      requestBody
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.apiResult = result;
        this.alert.success(this.translate.instant('i18n.UpdateSuccess',{number:result.number}), { autoClose: false });
        let ALMA_MENU_TOP_NAV_Search_Text:HTMLInputElement = (window.parent.document.getElementById('ALMA_MENU_TOP_NAV_Search_Text') as HTMLInputElement);
        let simpleSearchBtn = window.parent.document.getElementById('simpleSearchBtn');
        let simpleSearchIndexes:HTMLInputElement= (window.parent.document.getElementById('simpleSearchIndexes') as HTMLInputElement);
        let simpleSearchKeyButton:HTMLInputElement= (window.parent.document.getElementById('simpleSearchKeyButton') as HTMLInputElement);
        let ADD_HIDERADIO_TOP_NAV_Search_input_ORDERLINE:HTMLInputElement= (window.parent.document.getElementById('ADD_HIDERADIO_TOP_NAV_Search_input_ORDERLINE') as HTMLInputElement);
        ALMA_MENU_TOP_NAV_Search_Text.value = result.number
        console.log(simpleSearchBtn);
        console.log(simpleSearchKeyButton.value);
        simpleSearchBtn.click()
        // this.refreshPage();
      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to update data');
        console.error(e);
        this.loading = false;
      }
    });
  }

  private sendUpdateRequest(requestBody: any) {
    let request: Request = {
      url: this.pageEntities[0].link,
      method: HttpMethod.PUT,
      requestBody
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.apiResult = result;
        this.refreshPage();
      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to update data');
        console.error(e);
        this.loading = false;
      }
    });
  }

  private tryParseJson(value: any) {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error(e);
    }
    return undefined;
  }

}
