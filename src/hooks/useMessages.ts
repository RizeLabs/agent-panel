import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMessages,
  postMessage,
  getKnowledge,
  addKnowledge,
} from "../lib/tauri";
import { toast } from "sonner";

export function useMessages(agentId?: string, messageType?: string) {
  return useQuery({
    queryKey: ["messages", agentId, messageType],
    queryFn: () =>
      getMessages({
        agent_id: agentId,
        message_type: messageType,
        limit: 100,
      }),
    refetchInterval: 3000,
  });
}

export function usePostMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      from_agent: string;
      to_agent?: string;
      message_type: string;
      content: string;
      metadata?: string;
    }) => postMessage(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (err: Error) => toast.error(`Failed to send message: ${err.message}`),
  });
}

export function useKnowledge(category?: string, search?: string) {
  return useQuery({
    queryKey: ["knowledge", category, search],
    queryFn: () => getKnowledge({ category, search, limit: 50 }),
    refetchInterval: 5000,
  });
}

export function useAddKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      agent_id: string;
      category: string;
      title: string;
      content: string;
      tags?: string[];
    }) => addKnowledge(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Knowledge added");
    },
    onError: (err: Error) => toast.error(`Failed to add knowledge: ${err.message}`),
  });
}
