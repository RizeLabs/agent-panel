import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  startAgent,
  stopAgent,
  pauseAgent,
  resumeAgent,
  getAgentLogs,
  onAgentStatusChange,
} from "../lib/tauri";
import type { CreateAgentRequest, UpdateAgentRequest } from "../lib/types";
import { toast } from "sonner";

export function useAgents() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  // Listen for real-time status changes
  useEffect(() => {
    const unlisten = onAgentStatusChange(() => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  return query;
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => getAgent(agentId),
    enabled: !!agentId,
    refetchInterval: 3000,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateAgentRequest) => createAgent(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent created");
    },
    onError: (err: Error) => toast.error(`Failed to create agent: ${err.message}`),
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateAgentRequest) => updateAgent(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent updated");
    },
    onError: (err: Error) => toast.error(`Failed to update agent: ${err.message}`),
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
    },
    onError: (err: Error) => toast.error(`Failed to delete agent: ${err.message}`),
  });
}

export function useStartAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => startAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent started");
    },
    onError: (err: Error) => toast.error(`Failed to start agent: ${err.message}`),
  });
}

export function useStopAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => stopAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent stopped");
    },
    onError: (err: Error) => toast.error(`Failed to stop agent: ${err.message}`),
  });
}

export function usePauseAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => pauseAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent paused");
    },
    onError: (err: Error) => toast.error(`Failed to pause agent: ${err.message}`),
  });
}

export function useResumeAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      context,
    }: {
      agentId: string;
      context?: string;
    }) => resumeAgent(agentId, context),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent resumed");
    },
    onError: (err: Error) => toast.error(`Failed to resume agent: ${err.message}`),
  });
}

export function useAgentLogs(agentId: string) {
  return useQuery({
    queryKey: ["agent-logs", agentId],
    queryFn: () => getAgentLogs(agentId, 200),
    enabled: !!agentId,
    refetchInterval: 2000,
  });
}
