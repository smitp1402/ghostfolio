import {
  HEADER_KEY_IMPERSONATION,
  HEADER_KEY_TOKEN
} from '@ghostfolio/common/config';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { User } from '@ghostfolio/common/interfaces';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';

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
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { IonIcon } from '@ionic/angular/standalone';
import { MarkdownComponent } from 'ngx-markdown';
import { addIcons } from 'ionicons';
import {
  chatbubblesOutline,
  closeOutline,
  sendOutline,
  sparklesOutline
} from 'ionicons/icons';
import { Subject } from 'rxjs';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface SuggestedPrompt {
  query: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarkdownComponent,
    IonIcon
  ],
  selector: 'gf-gauntlet-chat-widget',
  styleUrls: ['./gauntlet-chat-widget.component.scss'],
  templateUrl: './gauntlet-chat-widget.component.html'
})
export class GfGauntletChatWidgetComponent implements OnDestroy, OnInit {
  @Input() renderInHeader = false;
  @Input() user: User;

  public isOpen = false;
  public messages: ChatMessage[] = [];
  public inputMessage = '';
  public isLoading = false;
  public showSuggestedPrompts = true;
  public error: string | null = null;
  public suggestedPrompts: SuggestedPrompt[] = [
    {
      query: 'Give me my portfolio overview.'
    },
    {
      query: 'Give me my portfolio performance.'
    },
    {
      query: 'List my recent activity.'
    },
    {
      query: 'What are my top holdings and allocation?'
    }
  ];

  private nextId = 0;
  private conversationId: string | null = null;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    private impersonationStorageService: ImpersonationStorageService,
    private tokenStorageService: TokenStorageService
  ) {
    addIcons({
      chatbubblesOutline,
      closeOutline,
      sendOutline,
      sparklesOutline
    });
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
    if (this.isOpen) {
      this.showSuggestedPrompts = true;
    }
    this.error = null;
    this.changeDetectorRef.markForCheck();
  }

  public close(): void {
    this.isOpen = false;
    this.showSuggestedPrompts = false;
    this.conversationId = null;
    this.changeDetectorRef.markForCheck();
  }

  public toggleSuggestedPrompts(event?: Event): void {
    event?.stopPropagation();
    this.showSuggestedPrompts = !this.showSuggestedPrompts;
    this.changeDetectorRef.markForCheck();
  }

  public useSuggestedPrompt(query: string): void {
    if (this.isLoading) {
      return;
    }

    this.inputMessage = query;
    this.send();
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

    const assistantMsg: ChatMessage = {
      id: `msg-${++this.nextId}`,
      role: 'assistant',
      text: '',
      timestamp: new Date()
    };
    this.messages = [...this.messages, assistantMsg];
    this.changeDetectorRef.markForCheck();

    const token = this.tokenStorageService.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token !== null) {
      headers[HEADER_KEY_TOKEN] = `Bearer ${token}`;
      const impersonationId = this.impersonationStorageService.getId();
      if (impersonationId !== null) {
        headers[HEADER_KEY_IMPERSONATION] = impersonationId;
      }
    }

    fetch('/api/v1/gauntlet-agent/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId: this.conversationId ?? undefined,
        message: text
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            (errBody as { error?: string })?.error ?? response.statusText
          );
        }
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  chunk?: string;
                  conversationId?: string;
                  error?: string;
                };
                if (data.error) {
                  assistantMsg.text =
                    (assistantMsg.text || '') + `Error: ${data.error}`;
                  this.changeDetectorRef.markForCheck();
                  break;
                }
                if (typeof data.conversationId === 'string') {
                  this.conversationId = data.conversationId;
                  continue;
                }
                if (typeof data.chunk === 'string') {
                  assistantMsg.text += data.chunk;
                  this.changeDetectorRef.markForCheck();
                }
              } catch {
                // ignore parse errors for incomplete lines
              }
            }
          }
        }
        if (buffer.startsWith('data: ')) {
          try {
            const data = JSON.parse(buffer.slice(6)) as {
              chunk?: string;
              conversationId?: string;
              error?: string;
            };
            if (data.error) {
              assistantMsg.text =
                (assistantMsg.text || '') + `Error: ${data.error}`;
            } else if (typeof data.conversationId === 'string') {
              this.conversationId = data.conversationId;
            } else if (typeof data.chunk === 'string') {
              assistantMsg.text += data.chunk;
            }
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => {
        const message =
          err?.message ?? $localize`Request failed`;
        this.error = message;
        assistantMsg.text = assistantMsg.text
          ? assistantMsg.text + '\n\nError: ' + message
          : 'Error: ' + message;
      })
      .finally(() => {
        if (!assistantMsg.text) {
          assistantMsg.text = $localize`No response received.`;
        }
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }
}
