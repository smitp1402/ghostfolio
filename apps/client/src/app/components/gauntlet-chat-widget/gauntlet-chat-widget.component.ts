import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { User } from '@ghostfolio/common/interfaces';

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { IonIcon } from '@ionic/angular/standalone';
import { MarkdownComponent } from 'ngx-markdown';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, closeOutline, sendOutline } from 'ionicons/icons';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarkdownComponent,
    MatProgressSpinnerModule,
    IonIcon
  ],
  selector: 'gf-gauntlet-chat-widget',
  styleUrls: ['./gauntlet-chat-widget.component.scss'],
  templateUrl: './gauntlet-chat-widget.component.html'
})
export class GfGauntletChatWidgetComponent implements OnDestroy, OnInit {
  @Input() user: User;

  public isOpen = false;
  public messages: ChatMessage[] = [];
  public inputMessage = '';
  public isLoading = false;
  public error: string | null = null;

  private nextId = 0;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    private http: HttpClient
  ) {
    addIcons({ chatbubblesOutline, closeOutline, sendOutline });
  }

  public get canShow(): boolean {
    return !!this.user && hasPermission(this.user?.permissions, permissions.readAiPrompt);
  }

  public ngOnInit(): void {}

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  @HostListener('document:click', ['$event'])
  public onDocumentClick(event: MouseEvent): void {
    if (
      this.isOpen &&
      event.target instanceof Node &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
      this.close();
    }
  }

  public toggle(event?: Event): void {
    event?.stopPropagation();
    this.isOpen = !this.isOpen;
    this.error = null;
    this.changeDetectorRef.markForCheck();
  }

  public close(): void {
    this.isOpen = false;
    this.changeDetectorRef.markForCheck();
  }

  public send(): void {
    const text = (this.inputMessage ?? '').trim();
    if (!text || this.isLoading) {
      return;
    }

    this.inputMessage = '';
    this.error = null;

    const userMsg: ChatMessage = {
      id: `msg-${++this.nextId}`,
      role: 'user',
      text,
      timestamp: new Date()
    };
    this.messages = [...this.messages, userMsg];
    this.isLoading = true;
    this.changeDetectorRef.markForCheck();

    this.http
      .post<{ text: string }>('/api/v1/gauntlet-agent/chat', { message: text })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (res) => {
          const assistantMsg: ChatMessage = {
            id: `msg-${++this.nextId}`,
            role: 'assistant',
            text: res?.text ?? '',
            timestamp: new Date()
          };
          this.messages = [...this.messages, assistantMsg];
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
        },
        error: (err) => {
          const message =
            err?.error?.error ?? err?.message ?? $localize`Request failed`;
          this.error = message;
          const assistantMsg: ChatMessage = {
            id: `msg-${++this.nextId}`,
            role: 'assistant',
            text: 'Error: ' + message,
            timestamp: new Date()
          };
          this.messages = [...this.messages, assistantMsg];
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
        }
      });
  }
}
