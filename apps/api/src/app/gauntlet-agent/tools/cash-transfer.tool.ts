import { AccountService } from '@ghostfolio/api/app/account/account.service';

import { DynamicTool } from '@langchain/core/tools';

interface CashTransferToolArgs {
  amount?: number;
  fromAccountId?: string;
  toAccountId?: string;
  fromAccountName?: string;
  toAccountName?: string;
  confirm?: boolean;
}

function parseArgs(input: unknown): CashTransferToolArgs {
  if (input == null) {
    return {};
  }

  let parsed: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.args === 'string') {
      try {
        parsed = JSON.parse(obj.args) as Record<string, unknown>;
      } catch {
        return {};
      }
    } else {
      parsed = obj;
    }
  } else {
    return {};
  }

  return {
    amount:
      typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
        ? parsed.amount
        : undefined,
    fromAccountId:
      typeof parsed.fromAccountId === 'string' ? parsed.fromAccountId.trim() : undefined,
    toAccountId:
      typeof parsed.toAccountId === 'string' ? parsed.toAccountId.trim() : undefined,
    fromAccountName:
      typeof parsed.fromAccountName === 'string'
        ? parsed.fromAccountName.trim()
        : undefined,
    toAccountName:
      typeof parsed.toAccountName === 'string' ? parsed.toAccountName.trim() : undefined,
    confirm: typeof parsed.confirm === 'boolean' ? parsed.confirm : undefined
  };
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function resolveAccount(
  accounts: Array<{ id: string; name: string; currency: string; balance: number }>,
  { accountId, accountName }: { accountId?: string; accountName?: string }
):
  | { account?: { id: string; name: string; currency: string; balance: number }; error?: string }
  | { account?: undefined; error: string } {
  if (accountId) {
    const byId = accounts.find((account) => account.id === accountId);
    if (!byId) {
      return { error: `Account with id "${accountId}" not found.` };
    }
    return { account: byId };
  }

  if (accountName) {
    const normalizedName = normalize(accountName);
    const exactMatches = accounts.filter(
      (account) => normalize(account.name) === normalizedName
    );
    if (exactMatches.length === 1) {
      return { account: exactMatches[0] };
    }
    if (exactMatches.length > 1) {
      return {
        error: `Multiple accounts match "${accountName}". Please use account id.`
      };
    }

    const partialMatches = accounts.filter((account) =>
      normalize(account.name).includes(normalizedName)
    );
    if (partialMatches.length === 1) {
      return { account: partialMatches[0] };
    }
    if (partialMatches.length > 1) {
      const candidates = partialMatches.map(({ id, name }) => `${name} (${id})`);
      return {
        error: `Multiple accounts match "${accountName}": ${candidates.join(', ')}.`
      };
    }
    return { error: `Account named "${accountName}" not found.` };
  }

  return {
    error:
      'Missing account reference. Provide fromAccountId/fromAccountName and toAccountId/toAccountName.'
  };
}

export function createCashTransferTool(
  accountService: AccountService,
  userId: string
): DynamicTool {
  return new DynamicTool({
    name: 'cash_transfer',
    description:
      'Use when the user asks to move/transfer cash between their accounts. Input JSON: amount (number), fromAccountId or fromAccountName, toAccountId or toAccountName, confirm (boolean). First call with confirm=false (or missing) to preview; execute transfer only when confirm=true.',
    func: async (input: unknown): Promise<string> => {
      try {
        const args = parseArgs(input);
        if (!args.amount || args.amount <= 0) {
          return 'Error: amount is required and must be greater than 0.';
        }

        const accountsRaw = await accountService.getAccounts(userId);
        const accounts = accountsRaw.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
          balance: account.balance
        }));

        const fromResolved = resolveAccount(accounts, {
          accountId: args.fromAccountId,
          accountName: args.fromAccountName
        });
        if (fromResolved.error || !fromResolved.account) {
          return `Error: ${fromResolved.error}`;
        }
        const toResolved = resolveAccount(accounts, {
          accountId: args.toAccountId,
          accountName: args.toAccountName
        });
        if (toResolved.error || !toResolved.account) {
          return `Error: ${toResolved.error}`;
        }

        const fromAccount = fromResolved.account;
        const toAccount = toResolved.account;
        if (fromAccount.id === toAccount.id) {
          return 'Error: source and destination accounts must be different.';
        }
        if (fromAccount.balance < args.amount) {
          return `Error: insufficient funds in "${fromAccount.name}". Available: ${fromAccount.balance} ${fromAccount.currency}.`;
        }

        if (!args.confirm) {
          return [
            `Transfer preview`,
            `From: ${fromAccount.name} (${fromAccount.id})`,
            `To: ${toAccount.name} (${toAccount.id})`,
            `Amount: ${args.amount} ${fromAccount.currency}`,
            `Current source balance: ${fromAccount.balance} ${fromAccount.currency}`,
            `Action not executed. Set confirm=true to execute this transfer.`
          ].join('\n');
        }

        await accountService.updateAccountBalance({
          accountId: fromAccount.id,
          amount: -args.amount,
          currency: fromAccount.currency,
          userId
        });
        await accountService.updateAccountBalance({
          accountId: toAccount.id,
          amount: args.amount,
          currency: fromAccount.currency,
          userId
        });

        return [
          'Transfer completed.',
          `From: ${fromAccount.name}`,
          `To: ${toAccount.name}`,
          `Amount: ${args.amount} ${fromAccount.currency}`
        ].join('\n');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error performing transfer';
        return `Error: Could not complete cash transfer. ${message}`;
      }
    }
  });
}
