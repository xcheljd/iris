"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Gem, Clock, Users } from "lucide-react";
import { useClient } from "@/components/client-provider";
import { useState, useCallback } from "react";
import { OutreachLogger } from "@/components/outreach-logger";

interface InterestsTabProps {
  client: any;
}

export function InterestsTab({ client }: InterestsTabProps) {
  const [activeTab, setActiveTab] = useState<"models" | "collections" | "matches">("models");

  // Extract unique model numbers and collections from products of interest
  const models = Array.from(
    new Set(
      client.productsOfInterest.flatMap((interest: string) => {
        // Simple parsing - model numbers are typically alphanumeric with hyphens
        const modelMatch = interest.match(/[A-Z0-9]+[0-9-]+[A-Z0-9]*/gi);
        return modelMatch || [];
      })
    )
  ).sort();

  // Extract collections (capitalized words that are clearly not model numbers)
  const collections = Array.from(
    new Set(
      client.productsOfInterest.flatMap((interest: string) => {
        const collectionMatch = interest.match(/\b[A-Z][a-z]+\b/g);
        return collectionMatch || [];
      })
    )
  ).sort();

  const promoMatches = client.matches.filter(
    (match: any) => match.promo?.modelNumber || match.promo?.collection
  );

  const handleCopyTemplate = (template: string, clientName: string) => {
    const personalized = template
      .replace(/{{first_name}}/g, client.firstName)
      .replace(/{{last_name}}/g, client.lastName || "")
      .replace(/{{client_name}}/g, `${client.firstName} ${client.lastName || ""}`)
      .replace(/{{employee_name}}/g, "Your Associate"); // This would come from auth context

    navigator.clipboard.writeText(personalized);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("models")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "models"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          Models of Interest
        </button>
        <button
          onClick={() => setActiveTab("collections")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "collections"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          Collections
        </button>
        <button
          onClick={() => setActiveTab("matches")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "matches"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          Promo Matches
        </button>
      </div>

      {/* Models Tab */}
      {activeTab === "models" && (
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
                {models.map((model, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="p-3 text-center justify-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => navigator.clipboard.writeText(model)}
                  >
                    {model}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No models of interest recorded</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Collections Tab */}
      {activeTab === "collections" && (
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
                {collections.map((collection, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => navigator.clipboard.writeText(collection)}
                  >
                    {collection}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No collections of interest recorded</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Promo Matches Tab */}
      {activeTab === "matches" && (
        <div className="space-y-4">
          {/* Summary */}
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
                  Promos match this client's interests
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Individual Matches */}
          {promoMatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Promo Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {promoMatches.map((match: any, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
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
                          variant={match.matchType === "model" ? "default" : "secondary"}
                          className="flex items-center gap-1"
                        >
                          {match.matchType === "model" ? (
                            <Star className="h-3 w-3" />
                          ) : (
                            <Gem className="h-3 w-3" />
                          )}
                          {match.matchType}
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2 mt-3">
                        <OutreachLogger
                          clientId={client.id}
                          clientName={`${client.firstName} ${client.lastName || ""}`}
                          trigger={
                            <button className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
                              Log Outreach
                            </button>
                          }
                        />
                        <button
                          className="px-3 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
                          onClick={() => navigator.clipboard.writeText(match.promo?.modelNumber || "")}
                        >
                          Copy Model
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}