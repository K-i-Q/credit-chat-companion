type FunctionsErrorLike = {
  context?: Response;
  message?: string;
};

export const getFunctionsErrorMessage = async (
  error: FunctionsErrorLike | null,
  fallback: string
) => {
  if (!error) return fallback;
  if (error.context) {
    const data = await error.context.json().catch(() => null);
    if (data?.error) {
      return data.error as string;
    }
  }
  return error.message || fallback;
};
