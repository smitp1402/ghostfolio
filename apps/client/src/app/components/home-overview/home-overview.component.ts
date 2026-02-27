import { GfPortfolioPerformanceComponent } from '@ghostfolio/client/components/portfolio-performance/portfolio-performance.component';
import { LayoutService } from '@ghostfolio/client/core/layout.service';
import { ImportActivitiesService } from '@ghostfolio/client/services/import-activities.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { NUMERICAL_PRECISION_THRESHOLD_6_FIGURES } from '@ghostfolio/common/config';
import {
  AssetProfileIdentifier,
  LineChartItem,
  PortfolioPerformance,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import { GfLineChartComponent } from '@ghostfolio/ui/line-chart';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import ms from 'ms';
import { DeviceDetectorService } from 'ngx-device-detector';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  imports: [
    CommonModule,
    GfLineChartComponent,
    GfPortfolioPerformanceComponent,
    MatButtonModule,
    RouterModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-home-overview',
  styleUrls: ['./home-overview.scss'],
  templateUrl: './home-overview.html'
})
export class GfHomeOverviewComponent implements OnDestroy, OnInit {
  public deviceType: string;
  public errors: AssetProfileIdentifier[];
  public hasError: boolean;
  public hasImpersonationId: boolean;
  public hasPermissionToCreateActivity: boolean;
  public historicalDataItems: LineChartItem[];
  public isAllTimeHigh: boolean;
  public isAllTimeLow: boolean;
  public isLoadingPerformance = true;
  public performance: PortfolioPerformance;
  public performanceLabel = $localize`Performance`;
  public precision = 2;
  public routerLinkAccounts = internalRoutes.accounts.routerLink;
  public routerLinkPortfolio = internalRoutes.portfolio.routerLink;
  public routerLinkPortfolioActivities =
    internalRoutes.portfolio.subRoutes.activities.routerLink;
  public showDetails = false;
  public unit: string;
  public user: User;
  public isImportingSample = false;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private deviceService: DeviceDetectorService,
    private importActivitiesService: ImportActivitiesService,
    private impersonationStorageService: ImpersonationStorageService,
    private layoutService: LayoutService,
    private snackBar: MatSnackBar,
    private userService: UserService
  ) {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToCreateActivity = hasPermission(
            this.user.permissions,
            permissions.createOrder
          );

          this.update();
        }
      });
  }

  public ngOnInit() {
    this.deviceType = this.deviceService.getDeviceInfo().deviceType;

    this.showDetails =
      !this.user.settings.isRestrictedView &&
      this.user.settings.viewMode !== 'ZEN';

    this.unit = this.showDetails ? this.user.settings.baseCurrency : '%';

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;

        this.changeDetectorRef.markForCheck();
      });

    this.layoutService.shouldReloadContent$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        this.update();
      });
  }

  public async onLoadSamplePortfolio() {
    if (this.isImportingSample) {
      return;
    }
    this.isImportingSample = true;
    this.changeDetectorRef.markForCheck();
    this.snackBar.open('⏳ ' + $localize`Importing sample portfolio...`);
    try {
      await this.importActivitiesService.importSamplePortfolio();
      this.snackBar.open(
        '✅ ' + $localize`Sample portfolio has been loaded`,
        undefined,
        { duration: ms('3 seconds') }
      );
      this.userService
        .get(true)
        .pipe(takeUntil(this.unsubscribeSubject))
        .subscribe(() => {
          this.update();
          this.changeDetectorRef.markForCheck();
        });
    } catch (error: any) {
      const msg =
        (Array.isArray(error?.error?.message)
          ? error.error.message[0]
          : error?.error?.message) ??
        error?.message ??
        $localize`Please try again later.`;
      console.error('Import failed:', error?.error ?? error);
      this.snackBar.open(
        $localize`Import failed` + ': ' + msg,
        $localize`Okay`,
        { duration: ms('8 seconds') }
      );
      this.changeDetectorRef.markForCheck();
    } finally {
      this.isImportingSample = false;
      this.snackBar.dismiss();
      this.changeDetectorRef.markForCheck();
    }
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private update() {
    this.historicalDataItems = null;
    this.isLoadingPerformance = true;

    this.dataService
      .fetchPortfolioPerformance({
        range: this.user?.settings?.dateRange
      })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(({ chart, errors, performance }) => {
        this.errors = errors;
        this.performance = performance;

        this.historicalDataItems = chart.map(
          ({ date, netPerformanceInPercentageWithCurrencyEffect }) => {
            return {
              date,
              value: netPerformanceInPercentageWithCurrencyEffect * 100
            };
          }
        );

        if (
          this.deviceType === 'mobile' &&
          this.performance.currentValueInBaseCurrency >=
            NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
        ) {
          this.precision = 0;
        }

        this.isLoadingPerformance = false;

        this.changeDetectorRef.markForCheck();
      });

    this.changeDetectorRef.markForCheck();
  }
}
