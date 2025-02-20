"use client";

import type React from "react";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { mnemonicSeedHexToPhrase } from "@/lib/bip39";

import { LegacyAccount, LegacyAccountSource } from "@/lib/types";

interface DecryptedAccount {
  id: string;
  phrase: string;
  type: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [jsonData, setJsonData] = useState<DecryptedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDecrypt = async () => {
    try {
      setIsDecrypting(true);
      setError(null);

      if (!file || !password) {
        throw new Error("Please provide both a file and password");
      }

      // Read the file
      const fileContent = await file.text();
      const parsedJson = JSON.parse(fileContent) as {
        accountSources: LegacyAccountSource[];
        accounts: LegacyAccount[];
      };

      // Import browser-passworder dynamically to avoid SSR issues
      const browserPassworder = await import("@metamask/browser-passworder");

      const allAccounts = [
        ...parsedJson.accountSources,
        ...parsedJson.accounts.filter((account) => account.type === "imported"),
      ];
      // Decrypt all account sources
      const decryptedAccounts = await Promise.all(
        allAccounts.map(async (accountOrAccountSource) => {
          try {
            const encryptedData =
              "encryptedData" in accountOrAccountSource
                ? accountOrAccountSource.encryptedData
                : accountOrAccountSource.encrypted;

            const decryptedData = (await browserPassworder.decrypt(
              password,
              encryptedData
            )) as {
              mnemonicSeedHex: string;
              entropyHex: string;
              keyPair?: string;
            };

            return {
              id: accountOrAccountSource.id,
              keyPair: decryptedData.keyPair || "No keypair found",
              phrase:
                accountOrAccountSource.type === "mnemonic"
                  ? mnemonicSeedHexToPhrase(decryptedData.entropyHex)
                  : "Not found",
              type: accountOrAccountSource.type,
            };
          } catch (err) {
            console.error(
              `Failed to decrypt account ${accountOrAccountSource.id}:`,
              err
            );

            setError(err instanceof Error ? err.message : "Failed to decrypt");
            return {
              id: accountOrAccountSource.id,
              phrase: "Failed to decrypt",
              type: accountOrAccountSource.type,
            };
          }
        })
      );

      setJsonData(decryptedAccounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decrypt data");
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <form
      onSubmit={handleDecrypt}
      className="container mx-auto max-w-2xl py-10"
    >
      <Card>
        <CardHeader>
          <CardTitle>Sui Wallet Data Decryptor</CardTitle>
          <CardDescription>
            Upload your JSON dump and enter your password to decrypt your data.
            {/* <span className="text-red-500 font-semibold">Note: No data </span> */}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">JSON File</Label>
            <Input
              id="file"
              type="file"
              accept=".json"
              onChange={handleFileChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the password used to unlock your wallet"
            />
          </div>
          <Button
            type="submit"
            onClick={handleDecrypt}
            disabled={!file || !password || isDecrypting}
            className="w-full"
          >
            {isDecrypting ? "Decrypting..." : "Decrypt Data"}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {jsonData.length > 0 && (
            <Tabs defaultValue="formatted" className="w-full">
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>
              <TabsContent value="raw">
                <pre className="mt-4 rounded-lg bg-muted p-4 overflow-auto text-sm">
                  {JSON.stringify(jsonData, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="formatted">
                <div className="mt-4 space-y-4">
                  <Accordion type="single" collapsible className="w-full">
                    {jsonData
                      .filter((account) =>
                        ["imported", "mnemonic"].includes(account.type)
                      )
                      .map((account, index) => (
                        <AccordionItem key={account.id} value={`item-${index}`}>
                          <AccordionTrigger>
                            Account {index + 1} ({account.type})
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="rounded-lg bg-muted p-4">
                              <div className="space-y-2">
                                <div className="grid gap-1">
                                  <Label className="text-xs">Account ID</Label>
                                  <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm">
                                    {account.id}
                                  </code>
                                </div>
                                <div className="grid gap-1">
                                  <Label className="text-xs">Private Key</Label>
                                  <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm break-all">
                                    {account.keyPair}
                                  </code>
                                </div>
                                <div className="grid gap-1">
                                  <Label className="text-xs">
                                    Recovery Phrase
                                  </Label>
                                  <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm break-all">
                                    {account.phrase}
                                  </code>
                                </div>
                                <div className="grid gap-1">
                                  <Label className="text-xs">Type</Label>
                                  <code className="rounded bg-muted-foreground/20 px-2 py-1 text-sm">
                                    {account.type}
                                  </code>
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                  </Accordion>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
