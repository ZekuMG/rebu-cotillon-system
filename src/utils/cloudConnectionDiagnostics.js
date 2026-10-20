const MAX_MESSAGE_LENGTH = 300;

const describeFailure = (source, result, optionalSources) => {
  const error = result?.status === 'rejected' ? result.reason : result?.value?.error;
  if (result?.status === 'fulfilled' && !error) return null;

  return {
    source,
    critical: !optionalSources.includes(source),
    code: error?.code || null,
    status: error?.status || null,
    message: String(error?.message || error || 'Error desconocido').slice(0, MAX_MESSAGE_LENGTH),
  };
};

export const describeCloudSourceFailures = (namedResults, optionalSources = []) =>
  namedResults
    .map(([source, result]) => describeFailure(source, result, optionalSources))
    .filter(Boolean);

export const formatCloudConnectionReport = ({ entries = [], appVersion, online, now = new Date() }) =>
  JSON.stringify({
    appVersion,
    generatedAt: now.toISOString(),
    browserOnline: online,
    incidents: entries
      .filter((entry) => String(entry?.scope || '').startsWith('cloud:'))
      .slice(-10)
      .map((entry) => ({
        at: entry.at,
        scope: entry.scope,
        code: entry.code || null,
        status: entry.status || null,
        message: entry.message || null,
        browserOnline: entry.browserOnline ?? null,
        elapsedMs: entry.elapsedMs ?? null,
        channelStatus: entry.channelStatus || null,
        heartbeatStatus: entry.heartbeatStatus || null,
        failures: entry.failures || null,
      })),
  }, null, 2);
