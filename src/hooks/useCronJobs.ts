import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCronJobs,
  createCronJob,
  updateCronJob,
  deleteCronJob,
  triggerCronJob,
} from "../lib/tauri";
import type { CronJob } from "../lib/types";
import { toast } from "sonner";

export function useCronJobs() {
  return useQuery({
    queryKey: ["cron-jobs"],
    queryFn: listCronJobs,
    refetchInterval: 10_000,
  });
}

export function useCreateCronJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      name: string;
      description?: string;
      interval_secs: number;
      agent_id: string;
      action_type: string;
      payload: string;
    }) => createCronJob(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron-jobs"] });
      toast.success("Cron job created");
    },
    onError: (err: Error) =>
      toast.error(`Failed to create cron job: ${err.message}`),
  });
}

export function useUpdateCronJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (job: CronJob) => updateCronJob(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron-jobs"] });
    },
    onError: (err: Error) =>
      toast.error(`Failed to update cron job: ${err.message}`),
  });
}

export function useDeleteCronJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => deleteCronJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron-jobs"] });
      toast.success("Cron job deleted");
    },
    onError: (err: Error) =>
      toast.error(`Failed to delete cron job: ${err.message}`),
  });
}

export function useTriggerCronJob() {
  return useMutation({
    mutationFn: (jobId: string) => triggerCronJob(jobId),
    onSuccess: () => toast.success("Job triggered"),
    onError: (err: Error) =>
      toast.error(`Failed to trigger cron job: ${err.message}`),
  });
}
