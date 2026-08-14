"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DB_DUMP_SCRIPT } from "@/lib/dumpScript";
import {
  recoverFromDump,
  type RecoveredAccount,
  type RecoveryResult,
} from "@/lib/recovery";
import { Check, Copy } from "lucide-react";

function parseTargetAddresses(raw: string): string[] | undefined {
  const addresses = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return addresses.length > 0 ? addresses : undefined;
}

function CopyButton({
  text,
  label,
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        setCopied(false);
      }
    );
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onCopy}
      className="flex items-center gap-1"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : (label ?? "Copy")}
    </Button>
  );
}

function unlockedLabel(value: RecoveredAccount["unlockedWith"]) {
  switch (value) {
    case "obfuscation":
      return "obfuscation password";
    case "password":
      return "wallet password";
    case "none":
      return "locked";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function AccountResult({
  account,
  index,
}: {
  account: RecoveredAccount;
  index: number;
}) {
  const matchCount = account.addresses.filter((row) => row.matchedTarget).length;

  return (
    <AccordionItem value={`item-${index}`}>
      <AccordionTrigger>
        <span className="flex flex-wrap items-center gap-2 pr-2 text-left">
          <span>
            {account.type} · {account.handle}
          </span>
          {matchCount > 0 ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              MATCH
            </Badge>
          ) : null}
          {account.error ? (
            <Badge variant="destructive">error</Badge>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <div className="grid gap-1">
            <Label className="text-xs">Type</Label>
            <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm">
              {account.type}
            </code>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Handle</Label>
            <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm break-all">
              {account.handle}
            </code>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Unlocked with</Label>
            <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm">
              {unlockedLabel(account.unlockedWith)}
            </code>
          </div>
          {account.error ? (
            <Alert variant="destructive">
              <AlertDescription>{account.error}</AlertDescription>
            </Alert>
          ) : null}
          {account.type === "zkLogin" ? (
            <p className="text-sm text-muted-foreground">
              zkLogin accounts have no recovery phrase or private key.
            </p>
          ) : null}
          {account.mnemonic ? (
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Recovery phrase</Label>
                <CopyButton text={account.mnemonic} label="Copy phrase" />
              </div>
              <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm break-all">
                {account.mnemonic}
              </code>
            </div>
          ) : null}
          {account.privateKey ? (
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Private key</Label>
                <CopyButton text={account.privateKey} label="Copy key" />
              </div>
              <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm break-all">
                {account.privateKey}
              </code>
            </div>
          ) : null}
          {account.addresses.length > 0 ? (
            <div className="grid gap-2">
              <Label className="text-xs">Derived addresses</Label>
              <ul className="space-y-2">
                {account.addresses.map((row) => (
                  <li
                    key={`${row.address}-${row.accountIndex ?? "imported"}`}
                    className={
                      row.matchedTarget
                        ? "rounded-md border border-emerald-600/40 bg-emerald-50 px-2 py-2 dark:bg-emerald-950/40"
                        : "rounded-md border border-transparent px-2 py-2"
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-sm break-all">{row.address}</code>
                      {typeof row.accountIndex === "number" ? (
                        <Badge variant="secondary">
                          index {row.accountIndex}
                        </Badge>
                      ) : null}
                      {row.matchedTarget ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          MATCH
                        </Badge>
                      ) : null}
                      <CopyButton text={row.address} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function StatusBanner({ result }: { result: RecoveryResult }) {
  const secretCount = result.accounts.filter(
    (account) => account.type === "mnemonic" || account.type === "imported"
  ).length;
  const recoveredCount = result.accounts.filter(
    (account) => account.mnemonic || account.privateKey
  ).length;
  const matchCount = result.accounts.reduce(
    (sum, account) =>
      sum + account.addresses.filter((row) => row.matchedTarget).length,
    0
  );

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTitle>Recovery status</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 space-y-1">
            <li>
              Wallet password:{" "}
              {result.passwordMode === "password-required"
                ? "required"
                : "not set (obfuscation only)"}
            </li>
            {result.passwordMode === "password-required" ? (
              <li>
                Password provided: {result.passwordProvided ? "yes" : "no"}
                {typeof result.passwordValid === "boolean"
                  ? result.passwordValid
                    ? " — valid"
                    : " — did not match stored hash"
                  : null}
              </li>
            ) : null}
            <li>
              Obfuscation password (base_password):{" "}
              {result.hasBasePassword ? "found" : "not found"}
            </li>
            <li>
              Recovered secrets: {recoveredCount} / {secretCount} passphrase or
              private-key accounts
            </li>
            {matchCount > 0 ? (
              <li>Target address matches: {matchCount}</li>
            ) : null}
          </ul>
        </AlertDescription>
      </Alert>
      {result.accounts.length === 0 ? (
        <Alert variant="destructive">
          <AlertTitle>No recoverable secrets in this dump</AlertTitle>
          <AlertDescription>
            The extension store may have been reset or the user signed out.
            Passphrases and private keys are stored only on the device and are
            never sent to Slush servers. After a reset or sign-out they cannot
            be recovered from this dump.
          </AlertDescription>
        </Alert>
      ) : null}
      {result.warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {result.warnings.map((warning, warningIndex) => (
                <li key={`${warningIndex}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [targetAddresses, setTargetAddresses] = useState("");
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [resultId, setResultId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description: string;
    variant?: "default" | "destructive";
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setError(null);
    setResult(null);
  };

  const copyDbDumpScript = () => {
    navigator.clipboard.writeText(DB_DUMP_SCRIPT).then(
      () => {
        setToastMessage({
          title: "Dump script copied",
          description:
            "In the Slush extension popup: right-click → Inspect → Console, paste, and press Enter. Then upload the downloaded slush-idb-dump.json.",
        });
        setTimeout(() => setToastMessage(null), 10_000);
      },
      () => {
        setToastMessage({
          variant: "destructive",
          title: "Failed to copy",
          description: "Could not copy to clipboard",
        });
        setTimeout(() => setToastMessage(null), 10_000);
      }
    );
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a dump JSON file");
      return;
    }

    try {
      setIsRecovering(true);
      setError(null);
      const dumpJson = JSON.parse(await file.text());
      const recovered = await recoverFromDump({
        dumpJson,
        userPassword: password.trim() ? password : undefined,
        targetAddresses: parseTargetAddresses(targetAddresses),
      });
      setResult(recovered);
      setResultId((id) => id + 1);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Failed to recover data");
    } finally {
      setIsRecovering(false);
    }
  };

  const sortedAccounts = result
    ? [...result.accounts].sort((a, b) => {
        const aMatch = a.addresses.some((row) => row.matchedTarget) ? 0 : 1;
        const bMatch = b.addresses.some((row) => row.matchedTarget) ? 0 : 1;
        return aMatch - bMatch;
      })
    : [];

  const defaultOpen = sortedAccounts.flatMap((account, index) =>
    account.addresses.some((row) => row.matchedTarget) || account.error
      ? [`item-${index}`]
      : []
  );

  return (
    <form
      onSubmit={handleRecover}
      className="container mx-auto max-w-3xl py-10"
    >
      <Card>
        <CardHeader>
          <CardTitle>Slush wallet recovery</CardTitle>
          <CardDescription>
            Recover passphrase and private-key wallets from a browser-extension
            IndexedDB dump. Everything runs in this browser — secrets are never
            uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toastMessage ? (
            <Alert variant={toastMessage.variant ?? "default"}>
              <h4 className="font-medium">{toastMessage.title}</h4>
              <AlertDescription className="whitespace-pre-line">
                {toastMessage.description}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>IndexedDB dump</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyDbDumpScript}
                className="flex items-center gap-1"
              >
                <Copy size={14} />
                Copy DB dump script
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Run the dump script in the Slush extension&apos;s DevTools
              (right-click the extension popup → Inspect → Console), not a
              normal web page. It downloads{" "}
              <code>slush-idb-dump.json</code>.
            </p>
            <Input
              id="file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Wallet password{" "}
              <span className="font-normal text-muted-foreground">
                (optional — only needed if the user set a wallet password)
              </span>
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank if the wallet had no password"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targets">
              Target addresses{" "}
              <span className="font-normal text-muted-foreground">
                (optional — one per line or comma-separated)
              </span>
            </Label>
            <Textarea
              id="targets"
              value={targetAddresses}
              onChange={(e) => setTargetAddresses(e.target.value)}
              placeholder="0x…&#10;0x…"
              className="min-h-[88px]"
            />
          </div>

          <Button
            type="submit"
            disabled={!file || isRecovering}
            className="w-full"
          >
            {isRecovering ? "Recovering..." : "Recover"}
          </Button>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <Tabs defaultValue="formatted" className="w-full">
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>
              <TabsContent value="raw">
                <pre className="mt-4 overflow-auto rounded-lg bg-muted p-4 text-sm">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="formatted" className="space-y-4">
                <StatusBanner result={result} />
                {sortedAccounts.length > 0 ? (
                  <Accordion
                    key={resultId}
                    type="multiple"
                    defaultValue={defaultOpen}
                    className="w-full"
                  >
                    {sortedAccounts.map((account, index) => (
                      <AccountResult
                        key={`${account.type}-${account.handle}-${index}`}
                        account={account}
                        index={index}
                      />
                    ))}
                  </Accordion>
                ) : null}
              </TabsContent>
            </Tabs>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}
