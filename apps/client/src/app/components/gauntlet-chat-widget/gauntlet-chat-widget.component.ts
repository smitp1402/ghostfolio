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
  NgZone,
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
  chevronBackOutline,
  chatbubblesOutline,
  closeOutline,
  menuOutline,
  sendOutline,
  sparklesOutline
} from 'ionicons/icons';
import { Subject } from 'rxjs';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  structured?: StructuredResponse;
  showSources?: boolean;
}

interface SuggestedPrompt {
  query: string;
}

interface StructuredCitation {
  source: string;
  evidence: string;
}

interface StructuredResponse {
  answer: string;
  confidence: number;
  citations: StructuredCitation[];
  warnings: string[];
  verdict: 'PASS' | 'WARN' | 'REWRITE' | 'BLOCK';
  reasons: string[];
}

interface StreamPayload {
  chunk?: string;
  conversationId?: string;
  error?: string;
  structured?: StructuredResponse;
}

interface ConversationHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
  conversationId: string | null;
  messages: ChatMessage[];
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
  public isHistorySidebarOpen = false;
  public showSuggestedPrompts = true;
  public error: string | null = null;
  public conversationHistory: ConversationHistoryItem[] = [];
  public suggestedPrompts: SuggestedPrompt[] = [
    {
      query: 'Give me my portfolio overview.'
    },
    {
      query: 'How is my portfolio performance this year?'
    },
    {
      query: 'List my recent activity.'
    },
    {
      query: 'Run my portfolio risk report.'
    },
    {
      query: 'Show AAPL historical price for 2025.'
    }
  ];

  private nextId = 0;
  private conversationId: string | null = null;
  public currentHistoryId: string | null = null;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    private impersonationStorageService: ImpersonationStorageService,
    private ngZone: NgZone,
    private tokenStorageService: TokenStorageService
  ) {
    addIcons({
      chevronBackOutline,
      chatbubblesOutline,
      closeOutline,
      menuOutline,
      sendOutline,
      sparklesOutline
    });
  }

  public get canShow(): boolean {
    return !!this.user && hasPermission(this.user?.permissions, permissions.readAiPrompt);
  }

  public ngOnInit(): void {
    this.loadConversationHistory();
  }

  public ngOnDestroy(): void {
    this.saveCurrentConversationToHistory();
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
      this.showSuggestedPrompts = this.messages.length === 0;
    }
    this.error = null;
    this.changeDetectorRef.markForCheck();
  }

  public close(): void {
    this.isOpen = false;
    this.showSuggestedPrompts = false;
    this.changeDetectorRef.markForCheck();
  }

  public startNewChat(event?: Event): void {
    event?.stopPropagation();
    if (this.isLoading) {
      return;
    }
    this.saveCurrentConversationToHistory();
    this.messages = [];
    this.inputMessage = '';
    this.error = null;
    this.conversationId = null;
    this.currentHistoryId = null;
    this.nextId = 0;
    this.showSuggestedPrompts = true;
    this.changeDetectorRef.markForCheck();
  }

  public toggleSuggestedPrompts(event?: Event): void {
    event?.stopPropagation();
    this.showSuggestedPrompts = !this.showSuggestedPrompts;
    this.changeDetectorRef.markForCheck();
  }

  public toggleHistorySidebar(event?: Event): void {
    event?.stopPropagation();
    this.isHistorySidebarOpen = !this.isHistorySidebarOpen;
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
    this.showSuggestedPrompts = false;
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
                  structured?: StructuredResponse;
                };
                if (data.error) {
                  this.runInAngular(() => {
                    assistantMsg.text =
                      (assistantMsg.text || '') + `Error: ${data.error}`;
                  });
                  break;
                }
                if (typeof data.conversationId === 'string') {
                  this.runInAngular(() => {
                    this.conversationId = data.conversationId!;
                  });
                  continue;
                }
                if (data.structured && typeof data.structured.answer === 'string') {
                  this.applyStructuredResponse(assistantMsg, data);
                  continue;
                }
                if (typeof data.chunk === 'string') {
                  this.runInAngular(() => {
                    assistantMsg.text += data.chunk!;
                  });
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
              structured?: StructuredResponse;
            };
            if (data.error) {
              this.runInAngular(() => {
                assistantMsg.text =
                  (assistantMsg.text || '') + `Error: ${data.error}`;
              });
            } else if (typeof data.conversationId === 'string') {
              this.runInAngular(() => {
                this.conversationId = data.conversationId!;
              });
            } else if (data.structured && typeof data.structured.answer === 'string') {
              this.applyStructuredResponse(assistantMsg, data);
            } else if (typeof data.chunk === 'string') {
              this.runInAngular(() => {
                assistantMsg.text += data.chunk!;
              });
            }
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => {
        const message =
          err?.message ?? $localize`Request failed`;
        this.runInAngular(() => {
          this.error = message;
          assistantMsg.text = assistantMsg.text
            ? assistantMsg.text + '\n\nError: ' + message
            : 'Error: ' + message;
        });
      })
      .finally(() => {
        this.runInAngular(() => {
          if (!assistantMsg.text) {
            assistantMsg.text = $localize`No response received.`;
          }
          this.isLoading = false;
          this.saveCurrentConversationToHistory();
        });
      });
  }

  private runInAngular(work: () => void): void {
    this.ngZone.run(() => {
      work();
      try {
        this.changeDetectorRef.detectChanges();
      } catch {
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  public toggleSources(msg: ChatMessage, event?: Event): void {
    event?.stopPropagation();
    msg.showSources = !msg.showSources;
    this.changeDetectorRef.markForCheck();
  }

  public openConversationHistoryItem(item: ConversationHistoryItem): void {
    if (this.isLoading) {
      return;
    }
    this.messages = this.cloneMessages(item.messages);
    this.conversationId = item.conversationId;
    this.currentHistoryId = item.id;
    this.error = null;
    this.showSuggestedPrompts = false;
    this.nextId = this.messages.length;
    this.changeDetectorRef.markForCheck();
  }

  public formatHistoryTimestamp(isoTimestamp: string): string {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString([], {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short'
    });
  }

  private applyStructuredResponse(
    assistantMsg: ChatMessage,
    payload: StreamPayload
  ): void {
    this.runInAngular(() => {
      assistantMsg.structured = payload.structured;
      assistantMsg.text = payload.structured?.answer ?? assistantMsg.text;
      if (assistantMsg.showSources === undefined) {
        assistantMsg.showSources = false;
      }
    });
  }

  private getHistoryStorageKey(): string {
    return `gauntlet-chat-history:${this.user?.id ?? 'anonymous'}`;
  }

  private loadConversationHistory(): void {
    try {
      const raw = localStorage.getItem(this.getHistoryStorageKey());
      if (!raw) {
        this.conversationHistory = [];
        return;
      }
      const parsed = JSON.parse(raw) as ConversationHistoryItem[];
      this.conversationHistory = (Array.isArray(parsed) ? parsed : [])
        .map((item) => ({
          ...item,
          messages: this.cloneMessages(item.messages ?? [])
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20);
    } catch {
      this.conversationHistory = [];
    }
  }

  private persistConversationHistory(): void {
    localStorage.setItem(
      this.getHistoryStorageKey(),
      JSON.stringify(this.conversationHistory)
    );
  }

  private saveCurrentConversationToHistory(): void {
    const hasRealMessages = this.messages.some((msg) => msg.text.trim().length > 0);
    if (!hasRealMessages) {
      return;
    }

    if (!this.currentHistoryId) {
      this.currentHistoryId = `hist-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
    }

    const firstUserMessage = this.messages.find(
      (msg) => msg.role === 'user' && msg.text.trim()
    );
    const title = (firstUserMessage?.text ?? 'Untitled chat')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64);
    const updatedAt = new Date().toISOString();

    const record: ConversationHistoryItem = {
      id: this.currentHistoryId,
      title,
      updatedAt,
      conversationId: this.conversationId,
      messages: this.cloneMessages(this.messages)
    };

    const withoutCurrent = this.conversationHistory.filter(
      (item) => item.id !== this.currentHistoryId
    );
    this.conversationHistory = [record, ...withoutCurrent].slice(0, 20);
    this.persistConversationHistory();
  }

  private cloneMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) => ({
      ...msg,
      timestamp:
        msg.timestamp instanceof Date ? new Date(msg.timestamp) : new Date(msg.timestamp),
      structured: msg.structured
        ? {
            ...msg.structured,
            citations: [...msg.structured.citations],
            warnings: [...msg.structured.warnings],
            reasons: [...msg.structured.reasons]
          }
        : undefined
    }));
  }
}
