"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, Gem, Clock, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OutreachLogger } from "@/components/outreach-logger";
import { EmptyState } from "@/components/empty-state";
import type { FullClient, PromoMatchWithPromo } from "@/components/client-provider";

interface InterestsTabProps {
  client: FullClient;
}

export function InterestsTab({ client }: InterestsTabProps) {
  const [activeTab, setActiveTab] = useState<"models" | "collections" | "matches">("models");

  const models = Array.from(
    new Set(
      client.productsOfInterest.flatMap((interest: string) => {
        const modelMatch = interest.match(/[A-Z0-9]+[0-9-]+[A-Z0-9]*/gi);
        return modelMatch || [];
      })
    )
  ).sort() as string[];

  const collections = Array.from(
    new Set(
      client.productsOfInterest.flatMap((interest: string) => {
        const collectionMatch = interest.match(/\b[A-Z][a-z]+\b/g);
        return collectionMatch || [];
      })
    )
  ).sort() as string[];

  const promoMatches = client.matches.filter(
    (match: PromoMatchWithPromo) => match.promo?.modelNumber || match.promo?.collection
  );

  const handleCopyTemplate = (modelNumber: string, collection: string) => {
    const template = `Hi ${client.firstName}, we have a great promo on the ${modelNumber} from the ${collection} collection. Would you like to come in and take a look?`;
    navigator.clipboard.writeText(template);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "models" | "collections" | "matches")}>
        <TabsList>
          <TabsTrigger value="models">Models of Interest</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="matches">Promo Matches</TabsTrigger>
        </TabsList>

        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Models of Interest
              </CardTitle>
            </CardHeader>
            <CardContent>
              {models.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {models.map((model) => (
                    <Badge
                      key={model}
                      variant="outline"
                      className="p-3 text-center justify-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => navigator.clipboard.writeText(model)}
                    >
                      {model}
                    </Badge>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Clock} title="No models of interest recorded" compact />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Collections of Interest
              </CardTitle>
            </CardHeader>
            <CardContent>
              {collections.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {collections.map((collection) => (
                    <Badge
                      key={collection}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => navigator.clipboard.writeText(collection)}
                    >
                      {collection}
                    </Badge>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Users} title="No collections of interest recorded" compact />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Current Promo Matches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-primary">
                    {promoMatches.length}
                  </div>
                  <div className="text-muted-foreground">
                    Promos match this client&apos;s interests
                  </div>
                </div>
              </CardContent>
            </Card>

            {promoMatches.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Promo Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {promoMatches.map((match: PromoMatchWithPromo) => (
                      <div key={match.match.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium">
                              {match.promo?.modelNumber}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {match.promo?.collection}
                            </div>
                          </div>
                          <Badge
                            variant={match.match.matchType === "model" ? "default" : "secondary"}
                            className="flex items-center gap-1"
                          >
                            {match.match.matchType === "model" ? (
                              <Star className="h-3 w-3" />
                            ) : (
                              <Gem className="h-3 w-3" />
                            )}
                            {match.match.matchType}
                          </Badge>
                        </div>

                        <div className="flex gap-2 mt-3">
                          <OutreachLogger
                            clientId={client.id}
                            clientName={`${client.firstName} ${client.lastName || ""}`}
                            trigger={
                              <Button size="sm">
                                Log Outreach
                              </Button>
                            }
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(match.promo?.modelNumber || "")}
                          >
                            Copy Model
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              handleCopyTemplate(match.promo?.modelNumber || "", match.promo?.collection || "");
                              toast.success("Outreach template copied");
                            }}
                          >
                            Copy Template
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
