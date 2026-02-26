import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSwarm,
  startSwarm,
  stopSwarm,
  getSwarmStatus,
  getSwarms,
} from "../lib/tauri";
import { toast } from "sonner";

export function useCreateSwarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      name: string;
      goal?: string;
      agent_configs: Array<{
        agent_id: string;
        system_prompt?: string;
        skills?: string[];
      }>;
    }) => createSwarm(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swarm"] });
      toast.success("Swarm created");
    },
    onError: (err: Error) => toast.error(`Failed to create swarm: ${err.message}`),
  });
}

export function useStartSwarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (swarmId: string) => startSwarm(swarmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swarm"] });
      toast.success("Swarm started");
    },
    onError: (err: Error) => toast.error(`Failed to start swarm: ${err.message}`),
  });
}

export function useStopSwarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (swarmId: string) => stopSwarm(swarmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swarm"] });
      toast.success("Swarm stopped");
    },
    onError: (err: Error) => toast.error(`Failed to stop swarm: ${err.message}`),
  });
}

export function useSwarmStatus(swarmId: string) {
  return useQuery({
    queryKey: ["swarm", swarmId],
    queryFn: () => getSwarmStatus(swarmId),
    enabled: !!swarmId,
    refetchInterval: 3000,
  });
}

export function useSwarms() {
  return useQuery({
    queryKey: ["swarms"],
    queryFn: getSwarms,
    refetchInterval: 5000,
  });
}
