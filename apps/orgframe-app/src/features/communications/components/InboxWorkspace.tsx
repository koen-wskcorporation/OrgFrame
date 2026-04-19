"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Input } from "@orgframe/ui/primitives/input";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Plus, Search } from "lucide-react";
import {
  createContactFromConversationAction,
  dismissConversationSuggestionsAction,
  getInboxWorkspaceDataAction,
  linkConversationIdentityAction,
  mergeContactsAction,
  rejectSuggestionAction,
  rerunConversationSuggestionsAction,
  searchInboxContactsAction,
  unlinkChannelIdentityAction
} from "@/src/features/communications/actions";
import type { CommContact, ContactMatchReasonCode, InboxWorkspaceReadModel } from "@/src/features/communications/types";

type InboxWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: InboxWorkspaceReadModel;
};

function channelLabel(channelType: string) {
  return channelType.replace(/_/g, " ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function mapReasonsToLabel(reasons: ContactMatchReasonCode[]) {
  if (reasons.includes("authenticated_claim")) {
    return "Authenticated account match";
  }
  if (reasons.includes("exact_primary_email") || reasons.includes("exact_known_identity_email")) {
    return "Exact email match";
  }
  if (reasons.includes("exact_primary_phone") || reasons.includes("exact_known_identity_phone")) {
    return "Exact phone number match";
  }
  if (reasons.includes("name_similarity")) {
    return "Name similarity match";
  }
  return "Possible profile match";
}

export function InboxWorkspace({ orgSlug, canWrite, initialReadModel }: InboxWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedConversationId, setSelectedConversationId] = useState(initialReadModel.selectedConversation?.conversation.id ?? null);
  const [isMutating, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CommContact[]>([]);

  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactNotes, setNewContactNotes] = useState("");

  const [mergeTargetContactId, setMergeTargetContactId] = useState<string | null>(null);
  const [mergeDisplayName, setMergeDisplayName] = useState("");
  const [mergeFirstName, setMergeFirstName] = useState("");
  const [mergeLastName, setMergeLastName] = useState("");
  const [mergeEmail, setMergeEmail] = useState("");
  const [mergePhone, setMergePhone] = useState("");
  const [mergeNotes, setMergeNotes] = useState("");

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) {
      return readModel.selectedConversation;
    }

    if (readModel.selectedConversation?.conversation.id === selectedConversationId) {
      return readModel.selectedConversation;
    }

    const fallback = readModel.conversations.find((item) => item.conversation.id === selectedConversationId);
    if (!fallback) {
      return readModel.selectedConversation;
    }

    return {
      conversation: fallback.conversation,
      identity: fallback.identity,
      contact: fallback.contact,
      messages: [],
      suggestions: [],
      history: []
    };
  }, [readModel, selectedConversationId]);

  function refreshWorkspace(conversationId?: string | null, successTitle?: string) {
    startTransition(async () => {
      const result = await getInboxWorkspaceDataAction({
        orgSlug,
        conversationId: conversationId ?? undefined
      });

      if (!result.ok) {
        toast({
          title: "Inbox refresh failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setReadModel(result.data);
      setSelectedConversationId(result.data.selectedConversation?.conversation.id ?? null);

      if (successTitle) {
        toast({
          title: successTitle,
          variant: "success"
        });
      }
    });
  }

  function selectConversation(conversationId: string) {
    if (conversationId === selectedConversationId) {
      return;
    }

    setSelectedConversationId(conversationId);
    refreshWorkspace(conversationId);
  }

  function linkContact(contactId: string, source: "manual" | "suggestion") {
    if (!selectedConversation || !selectedConversation.identity || !canWrite) {
      return;
    }
    const conversationId = selectedConversation.conversation.id;
    const identityId = selectedConversation.identity.id;

    startTransition(async () => {
      const result = await linkConversationIdentityAction({
        orgSlug,
        conversationId,
        contactId,
        identityId,
        source
      });

      if (!result.ok) {
        toast({
          title: "Link failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSearchResults([]);
      setMergeTargetContactId(null);
      refreshWorkspace(conversationId, "Identity linked");
    });
  }

  function createContactFromConversation() {
    if (!selectedConversation || !canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await createContactFromConversationAction({
        orgSlug,
        conversationId: selectedConversation.conversation.id,
        displayName: newContactName,
        email: newContactEmail,
        phone: newContactPhone,
        notes: newContactNotes
      });

      if (!result.ok) {
        toast({
          title: "Contact creation failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setNewContactNotes("");
      refreshWorkspace(selectedConversation.conversation.id, "Contact created and linked");
    });
  }

  function dismissSuggestions() {
    if (!selectedConversation || !canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await dismissConversationSuggestionsAction({
        orgSlug,
        conversationId: selectedConversation.conversation.id
      });

      if (!result.ok) {
        toast({
          title: "Dismiss failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace(selectedConversation.conversation.id, "Suggestions dismissed");
    });
  }

  function rerunSuggestions() {
    if (!selectedConversation || !canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await rerunConversationSuggestionsAction({
        orgSlug,
        conversationId: selectedConversation.conversation.id
      });

      if (!result.ok) {
        toast({
          title: "Regeneration failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace(selectedConversation.conversation.id, `Generated ${result.data.suggestionCount} suggestions`);
    });
  }

  function unlinkIdentity() {
    if (!selectedConversation?.identity || !canWrite) {
      return;
    }
    const conversationId = selectedConversation.conversation.id;
    const identityId = selectedConversation.identity.id;

    startTransition(async () => {
      const result = await unlinkChannelIdentityAction({
        orgSlug,
        identityId
      });

      if (!result.ok) {
        toast({
          title: "Unlink failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace(conversationId, "Identity unlinked");
    });
  }

  function rejectSuggestion(suggestionId: string) {
    if (!selectedConversation || !canWrite) {
      return;
    }
    const conversationId = selectedConversation.conversation.id;

    startTransition(async () => {
      const result = await rejectSuggestionAction({
        orgSlug,
        conversationId,
        suggestionId
      });

      if (!result.ok) {
        toast({
          title: "Reject failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace(conversationId, "Suggestion rejected");
    });
  }

  function runContactSearch() {
    startTransition(async () => {
      const result = await searchInboxContactsAction({
        orgSlug,
        query: searchQuery
      });

      if (!result.ok) {
        toast({
          title: "Search failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSearchResults(result.data.contacts);
    });
  }

  function mergeSelectedContact() {
    if (!selectedConversation?.contact || !mergeTargetContactId || !canWrite) {
      return;
    }
    const sourceContactId = selectedConversation.contact.id;
    const conversationId = selectedConversation.conversation.id;

    startTransition(async () => {
      const result = await mergeContactsAction({
        orgSlug,
        sourceContactId,
        targetContactId: mergeTargetContactId,
        displayName: mergeDisplayName,
        firstName: mergeFirstName,
        lastName: mergeLastName,
        primaryEmail: mergeEmail,
        primaryPhone: mergePhone,
        notes: mergeNotes
      });

      if (!result.ok) {
        toast({
          title: "Merge failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setMergeTargetContactId(null);
      refreshWorkspace(conversationId, "Contacts merged");
    });
  }

  return (
    <div className="ui-stack-page">
      {isMutating ? <Alert variant="info">Updating inbox...</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Unified Inbox</CardTitle>
          <CardDescription>Resolve cross-channel identities without creating duplicate contacts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-2 border-r pr-2">
              {readModel.conversations.length === 0 ? <Alert variant="info">No conversations yet.</Alert> : null}
              {readModel.conversations.map((item) => (
                <button
                  className={`ui-list-item ui-list-item-hover w-full text-left ${selectedConversation?.conversation.id === item.conversation.id ? "border-accent/45" : ""}`}
                  key={item.conversation.id}
                  onClick={() => selectConversation(item.conversation.id)}
                  type="button"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{channelLabel(item.conversation.channelType)}</p>
                  <p className="font-semibold text-text">{item.contact?.displayName ?? "Unknown contact"}</p>
                  <p className="text-xs text-text-muted">{item.identity?.displayLabel ?? item.identity?.externalId ?? "Unidentified sender"}</p>
                  <p className="mt-1 text-xs text-text-muted">{formatDateTime(item.conversation.lastMessageAt)}</p>
                  {item.pendingSuggestionCount > 0 ? (
                    <p className="mt-1 text-xs font-semibold text-accent">{item.pendingSuggestionCount} suggested matches</p>
                  ) : null}
                </button>
              ))}
            </div>

            <div>
              {!selectedConversation ? <Alert variant="info">Select a conversation to review identity details.</Alert> : null}
              {selectedConversation ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>{selectedConversation.contact?.displayName ?? "Unknown contact"}</CardTitle>
                        <CardDescription>
                          {channelLabel(selectedConversation.conversation.channelType)} · {selectedConversation.conversation.resolutionStatus}
                        </CardDescription>
                      </CardHeader>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Messages</CardTitle>
                        <CardDescription>{selectedConversation.messages.length} message(s)</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {selectedConversation.messages.length === 0 ? <Alert variant="info">No message records yet.</Alert> : null}
                        {selectedConversation.messages.map((message) => (
                          <div className="ui-list-item" key={message.id}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{message.direction}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-text">{message.bodyText || "(empty message)"}</p>
                            <p className="mt-1 text-xs text-text-muted">{formatDateTime(message.sentAt)}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>Resolution</CardTitle>
                        <CardDescription>
                          {selectedConversation.identity?.displayLabel ?? selectedConversation.identity?.externalId ?? "Unknown identity"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {selectedConversation.contact ? (
                          <div className="ui-muted-block space-y-1">
                            <p className="text-sm font-semibold text-text">{selectedConversation.contact.displayName}</p>
                            <p className="text-xs text-text-muted">{selectedConversation.contact.primaryEmail ?? "No email"}</p>
                            <p className="text-xs text-text-muted">{selectedConversation.contact.primaryPhone ?? "No phone"}</p>
                          </div>
                        ) : (
                          <Alert variant="info">Conversation is unresolved.</Alert>
                        )}

                        {selectedConversation.suggestions.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Suggested matches</p>
                            {selectedConversation.suggestions.map((item) => (
                              <div className="ui-list-item" key={item.suggestion.id}>
                                <p className="font-semibold text-text">{item.contact.displayName}</p>
                                <p className="text-xs text-text-muted">{item.contact.primaryEmail ?? "No email"}</p>
                                <p className="text-xs text-text-muted">{item.contact.primaryPhone ?? "No phone"}</p>
                                <p className="mt-1 text-xs text-accent">
                                  {item.suggestion.confidenceScore}% · {mapReasonsToLabel(item.suggestion.confidenceReasonCodes)}
                                </p>
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    disabled={!canWrite || !selectedConversation.identity}
                                    onClick={() => linkContact(item.contact.id, "suggestion")}
                                    size="sm"
                                    type="button"
                                  >
                                    Link
                                  </Button>
                                  <Button
                                    disabled={!canWrite}
                                    onClick={() => rejectSuggestion(item.suggestion.id)}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Link existing contact</p>
                          <div className="flex gap-2">
                            <Input onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search contact" value={searchQuery} />
                            <Button disabled={isMutating} onClick={runContactSearch} size="sm" type="button" variant="secondary">
                              <Search className="h-4 w-4" />
                              Search
                            </Button>
                          </div>
                          {searchResults.length > 0 ? (
                            <div className="space-y-1">
                              {searchResults.map((contact) => (
                                <div className="ui-list-item py-2" key={contact.id}>
                                  <p className="text-sm font-semibold text-text">{contact.displayName}</p>
                                  <p className="text-xs text-text-muted">{contact.primaryEmail ?? "No email"}</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Button
                                      disabled={!canWrite || !selectedConversation.identity}
                                      onClick={() => linkContact(contact.id, "manual")}
                                      size="sm"
                                      type="button"
                                      variant="secondary"
                                    >
                                      Link this contact
                                    </Button>
                                    {selectedConversation.contact ? (
                                      <Button
                                        onClick={() => setMergeTargetContactId(contact.id)}
                                        size="sm"
                                        type="button"
                                        variant={mergeTargetContactId === contact.id ? "secondary" : "ghost"}
                                      >
                                        Set merge target
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Create contact from conversation</p>
                          <Input onChange={(event) => setNewContactName(event.target.value)} placeholder="Display name" value={newContactName} />
                          <Input onChange={(event) => setNewContactEmail(event.target.value)} placeholder="Email" value={newContactEmail} />
                          <Input onChange={(event) => setNewContactPhone(event.target.value)} placeholder="Phone" value={newContactPhone} />
                          <Textarea onChange={(event) => setNewContactNotes(event.target.value)} placeholder="Notes" value={newContactNotes} />
                          <Button disabled={!canWrite} onClick={createContactFromConversation} size="sm" type="button">
                            <Plus className="h-4 w-4" />
                            Create + Link
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button disabled={!canWrite} onClick={rerunSuggestions} size="sm" type="button" variant="secondary">
                            Re-Run Suggestions
                          </Button>
                          <Button disabled={!canWrite} onClick={dismissSuggestions} size="sm" type="button" variant="secondary">
                            Not Now
                          </Button>
                          <Button disabled={!canWrite || !selectedConversation.identity} onClick={unlinkIdentity} size="sm" type="button" variant="ghost">
                            Unlink Identity
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {selectedConversation.contact ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>Merge Contacts</CardTitle>
                          <CardDescription>
                            Source: {selectedConversation.contact.displayName}
                            {mergeTargetContactId ? ` · Target selected` : ""}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Input onChange={(event) => setMergeDisplayName(event.target.value)} placeholder="Canonical display name" value={mergeDisplayName} />
                          <Input onChange={(event) => setMergeFirstName(event.target.value)} placeholder="Canonical first name" value={mergeFirstName} />
                          <Input onChange={(event) => setMergeLastName(event.target.value)} placeholder="Canonical last name" value={mergeLastName} />
                          <Input onChange={(event) => setMergeEmail(event.target.value)} placeholder="Canonical email" value={mergeEmail} />
                          <Input onChange={(event) => setMergePhone(event.target.value)} placeholder="Canonical phone" value={mergePhone} />
                          <Textarea onChange={(event) => setMergeNotes(event.target.value)} placeholder="Canonical notes" value={mergeNotes} />
                          <Button disabled={!canWrite || !mergeTargetContactId} onClick={mergeSelectedContact} size="sm" type="button">
                            Merge into Target
                          </Button>
                        </CardContent>
                      </Card>
                    ) : null}

                    <Card>
                      <CardHeader>
                        <CardTitle>History</CardTitle>
                        <CardDescription>Identity/linking activity timeline</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {selectedConversation.history.length === 0 ? <Alert variant="info">No resolution history yet.</Alert> : null}
                        {selectedConversation.history.map((event) => (
                          <div className="ui-list-item py-2" key={event.id}>
                            <p className="text-sm font-semibold text-text">{event.eventType.replace(/_/g, " ")}</p>
                            <p className="text-xs text-text-muted">{formatDateTime(event.createdAt)}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
