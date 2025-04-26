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
import { entropyToMnemonic } from "@/lib/bip39";
import { Copy } from "lucide-react";

function fromB64(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const DB_DUMP_SCRIPT = `async function dumpKeyvalStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("keyval-store");
    
    request.onerror = (event) => {
      reject(\`Database error: \${request.error}\`);
    };
    
    request.onsuccess = (event) => {
      const db = request.result;
      const storeNames = Array.from(db.objectStoreNames);
      const data = {};
      
      if (storeNames.length === 0) {
        resolve({ message: "No object stores found in database", data: {} });
        return;
      }
      
      let completedStores = 0;
      
      storeNames.forEach(storeName => {
        data[storeName] = [];
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const cursorRequest = store.openCursor();
        
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            data[storeName].push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          }
        };
        
        transaction.oncomplete = () => {
          completedStores++;
          if (completedStores === storeNames.length) {
            const jsonData = JSON.stringify(data, null, 2);
            resolve({ data, jsonData });
          }
        };
        
        transaction.onerror = (event) => {
          reject(\`Error accessing store \${storeName}: \${transaction.error}\`);
        };
      });
    };
  });
}

// Usage:
dumpKeyvalStore()
  .then(result => {
    console.log("Database dump completed!");
    console.log(result.data); // JavaScript object
    // To download as a file:
    const blob = new Blob([result.jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyval-store-dump.json';
    a.click();
    URL.revokeObjectURL(url);
  })
  .catch(error => console.error("Failed to dump database:", error));`;

interface DecryptedAccount {
  id: string;
  phrase: string;
  keyPair?: string;
  type: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [jsonData, setJsonData] = useState<DecryptedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description: string;
    variant?: "default" | "destructive";
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const copyDbDumpScript = () => {
    navigator.clipboard.writeText(DB_DUMP_SCRIPT).then(
      () => {
        setToastMessage({
          title: "Copied!",
          description:
            "Open the Slush / Sui Wallet extension, right click > Inspect > Console > Paste the script and run it. \n\n Then select the downloaded JSON file to the field below.",
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

  const handleDecrypt = async () => {
    try {
      setIsDecrypting(true);
      setError(null);

      if (!file || !password) {
        throw new Error("Please provide both a file and password");
      }

      const fileContent = await file.text();
      const parsedJson = JSON.parse(fileContent);

      const browserPassworder = await import("@metamask/browser-passworder");

      // Handle keyval store format
      let accounts: DecryptedAccount[] = [];

      if (parsedJson.keyval) {
        // Keyval store dump format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const account_entries = parsedJson.keyval.filter((item: any) =>
          item.key.includes("__")
        );

        accounts = await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          account_entries.map(async (entry: any) => {
            try {
              const [type, id] = entry.key.split("__");

              const decrypted = (await browserPassworder.decrypt(
                password,
                entry.value
              )) as string;

              const data = JSON.parse(decrypted).data;

              if (type === "mnemonic") {
                let phrase = "Recovery phrase not available";

                const entropyBytes = fromB64(data);
                phrase = entropyToMnemonic(entropyBytes);

                return {
                  id,
                  phrase,
                  keyPair: "N/A",
                  type,
                };
              } else if (type === "imported") {
                let keyPair = "No private key found";
                keyPair = data;

                return {
                  id,
                  phrase: "N/A",
                  keyPair,
                  type,
                };
              } else if (type === "zkLogin") {
                return {
                  id,
                  phrase: "N/A",
                  keyPair: "N/A",
                  type,
                };
              } else {
                return {
                  id,
                  phrase: "Unknown account type",
                  keyPair: "N/A",
                  type,
                };
              }
            } catch (err) {
              console.error(`Failed to decrypt account ${entry.key}:`, err);

              const [type, id] = entry.key.split("__");
              return {
                id: id || entry.key,
                phrase: "Failed to decrypt",
                type: type || "unknown",
              };
            }
          })
        );
      } else {
        throw new Error(
          "Unknown file format. Please provide a valid keyval store dump file"
        );
      }

      setJsonData(accounts);
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
            <span className="text-red-500 font-medium">
              <br />
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toastMessage && (
            <Alert variant={toastMessage.variant || "default"} className="mb-2">
              <h4 className="font-medium">{toastMessage.title}</h4>
              <AlertDescription>{toastMessage.description}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="file">JSON File</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyDbDumpScript}
                className="flex items-center gap-1"
              >
                <Copy size={14} />
                Copy DB Dump Script
              </Button>
            </div>
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
                    {jsonData.map((account, index) => (
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
                                  {account.keyPair
                                    ? account.keyPair
                                    : "No keypair found"}
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
