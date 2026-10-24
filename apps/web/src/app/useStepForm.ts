// A to-be step's title and route as a form (spec 076, React Hook Form + zod): the same rules for
// "+ Add step" and "Change this step"; the values come out trimmed, as `stepOps` takes them.
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const StepSchema = z.object({ title: z.string().trim().min(1, 'A title first.').max(200), route: z.string().trim().max(500) });

export const useStepForm = (initial: { title: string; route: string }) =>
  useForm<z.input<typeof StepSchema>, unknown, z.output<typeof StepSchema>>({ defaultValues: initial, resolver: zodResolver(StepSchema) });

/** The title's error as the `Field`'s `error` prop (spread; nothing when there is none). */
export const titleError = (form: ReturnType<typeof useStepForm>) => {
  const message = form.formState.errors.title?.message;
  return message ? { error: message } : {};
};
