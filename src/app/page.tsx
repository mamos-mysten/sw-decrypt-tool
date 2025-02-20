"use client";

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
import { mnemonicSeedHexToPhrase } from "@/lib/bip39";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [jsonData, setJsonData] = useState<any>(null);
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
      const parsedJson = JSON.parse(fileContent);

      // Import browser-passworder dynamically to avoid SSR issues
      const browserPassworder = await import("@metamask/browser-passworder");

      // Decrypt the data
      // Note: This is a simplified example. You'll need to handle each encrypted field
      const decryptedData = (await browserPassworder.decrypt(
        password,
        parsedJson.accountSources[0].encryptedData
      )) as { mnemonicSeedHex: string; entropyHex: string };

      const mnemonic = mnemonicSeedHexToPhrase(decryptedData.entropyHex);

      setJsonData({ phrase: mnemonic });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decrypt data");
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Sui Wallet Data Decryptor</CardTitle>
          <CardDescription>
            Upload your JSON dump and enter your password to decrypt your data
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
              placeholder="Enter your password"
            />
          </div>
          <Button
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

          {jsonData && (
            <Tabs defaultValue="raw" className="w-full">
              <TabsList>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
              </TabsList>
              <TabsContent value="raw">
                <pre className="mt-4 rounded-lg bg-muted p-4 overflow-auto text-sm">
                  {JSON.stringify(jsonData, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="formatted">
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <h3 className="font-medium mb-2">Decrypted Data</h3>
                    <div className="space-y-2">
                      {Object.entries(jsonData).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-mono text-sm">{key}:</span>
                          <span className="font-mono text-sm">
                            {JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
