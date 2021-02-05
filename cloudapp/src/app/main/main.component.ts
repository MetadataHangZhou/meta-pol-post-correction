import { Subscription } from 'rxjs';
import { FormsModule,ReactiveFormsModule } from '@angular/forms';
import {Component, OnInit, OnDestroy, NgModule} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod,
  Entity, PageInfo, RestErrorResponse, AlertService,EntityType
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
  resourceMetadata: ResourceMetadata = {};
  hasApiResult: boolean = false;
  loading = false;
  funds:Fund[] = [];
  vendors:Vendor[]= [];
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
      //if entity type is PO_LINE,display form
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
            this.getFunds(this.settings.instCode)
            this.getVendors(this.settings.instCode)
          }

        });

      }

    } else {
      this.apiResult = null;
      this.resourceMetadata = {}
    }
  }
  update(value: any) {
    if(!this.funds || !this.vendors) {
      this.alert.error('Failed to get funds or vendors,can not update data,check funds or vendors');
      return
    }

    if(!this.funds.length || !this.vendors.length) {
      this.alert.error('Failed to get funds or vendors,can not update data,check funds or vendors');
      return
    }
    let currencyIndex = this.currencyCode.findIndex((item)=>{
      return this.poLineInfo.currency===item.value
    })
    let fundsIndex = this.funds.findIndex((item)=>{
      return this.poLineInfo.fund===item.code
    })
    let vendorsIndex = this.vendors.findIndex((item)=>{
      return this.poLineInfo.vendor===item.code
    })
    let requestBody = value;
    let status = requestBody.status.value
    let index = requestBody.location.findIndex((item)=>{
      let copyindex =  item.copy.findIndex(copyItem=>{
        return copyItem.receive_date
      })
      if(copyindex>-1) {
        return true
      }
    })
    if(index>-1) {
      this.alert.error(this.translate.instant('i18n.NotAllowUpdate'),{autoClose:true,delay:6000});
      return
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
    if(window.confirm(this.translate.instant('i18n.UpdateConfirm'))) {
      this.loading = true;
      this.cancelPolineRequest(requestBody,status);
    }

  }

  refreshPage = () => {
    this.loading = true;
    this.eventsService.refreshPage().subscribe({
      next: () => this.alert.success('Success!'),
      error: e => {
        console.error(e);
        this.alert.error('Failed to refresh page',{autoClose:true,delay:6000});
      },
      complete: () => this.loading = false
    });
  }
  // cancel current poline and create a new poline.if poline status was cancelled,create new poline
  private cancelPolineRequest(requestBody: any,status:any) {
    let po_number = requestBody.po_number
    let number = requestBody.number
    let request: Request = {
      url: this.pageEntities[0].link+"?reason=LIBRARY_CANCELLED",
      method: HttpMethod.DELETE
    };

    if(status==="CANCELLED") {
      this.createPolineRequest(requestBody);
    }else{
      this.restService.call(request).subscribe({
        next: result => {
          this.createPolineRequest(requestBody);
        },
        error: (e: RestErrorResponse) => {
          this.alert.error('Failed to cancel POL,po_number:'+po_number+",number:"+number,{autoClose:true,delay:6000});
          this.alert.error('error:'+e.message,{autoClose:true,delay:6000});
          console.error(e);
          this.loading = false;
        }
      });
    }

  }
  // get vendor list
  private getVendors(library:any) {
    let request: Request = {
      url: '/almaws/v1/acq/vendors?limit=100&status=active',
      method: HttpMethod.GET
    };
    this.restService.call(request).subscribe({
      next: result => {
        let index = result.vendor.findIndex((item)=>{
          return this.poLineInfo.fund===item.code
        })
        if(index == -1) {
          result.vendor.push({
            code:this._apiResult.vendor.value,
            name:this._apiResult.vendor.desc
          })
        }
        this.vendors = result.vendor;
      },
      error: (e: RestErrorResponse) => {
        let vendors = []

        vendors.push({
          code:this._apiResult.vendor.value,
          name:this._apiResult.vendor.desc
        })
        this.vendors = vendors
        this.alert.error('get vendor list fail,library:'+library,{autoClose:true,delay:6000});
        this.alert.error('error:'+e.message,{autoClose:true,delay:6000});
        console.error(e);
        this.loading = false;
      }
    });
  }
  // get fund list
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
        this.alert.error('get fund list fail,library:'+library,{autoClose:true,delay:6000});
        this.alert.error('error:'+e.message,{autoClose:true,delay:6000});
        console.error(e);
        this.loading = false;
      }
    });
  }
  // create new poline and search poline-number
  private createPolineRequest(requestBody:any) {
    let po_number = requestBody.po_number
    let number = requestBody.number
    delete requestBody.number
    delete requestBody.po_number
    let request: Request = {
      url: '/almaws/v1/acq/po-lines',
      method: HttpMethod.POST,
      requestBody
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.loading = false;
        this.apiResult = result;
        this.alert.success(this.translate.instant('i18n.UpdateSuccess',{number:result.number}),{autoClose:true,delay:6000});
        let ALMA_MENU_TOP_NAV_Search_Text:HTMLInputElement = (window.parent.document.getElementById('ALMA_MENU_TOP_NAV_Search_Text') as HTMLInputElement);
        let simpleSearchBtn = window.parent.document.getElementById('simpleSearchBtn');
        let simpleSearchKey = window.parent.document.getElementById('simpleSearchKey') as HTMLInputElement;
        simpleSearchKey.value = 'ORDERLINE'
        ALMA_MENU_TOP_NAV_Search_Text.value = result.number
        simpleSearchBtn.click()
        // this.refreshPage();
      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to create new POL,po_number:'+po_number+",number:"+number,{autoClose:true,delay:6000});
        this.alert.error('error:'+e.message,{autoClose:true,delay:6000});
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
