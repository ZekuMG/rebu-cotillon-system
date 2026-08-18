const codedError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const isCurrentCentralMachine = (centralMachine, candidate) => Boolean(
  centralMachine?.machine?.device_id
  && candidate?.deviceId
  && centralMachine.machine.device_id === candidate.deviceId,
);

export const deactivateStaleCentralOverride = async ({
  desktop,
  centralMachine,
  candidate,
}) => {
  if (
    centralMachine?.available === false
    || !candidate?.deviceId
    || centralMachine?.machine?.device_id === candidate.deviceId
    || typeof desktop?.deactivateWhatsAppCentralMachine !== 'function'
  ) return { success: true, changed: false };

  const reset = await desktop.deactivateWhatsAppCentralMachine(candidate.deviceId);
  if (!reset?.success) {
    throw codedError(
      reset?.error || 'No se pudo restaurar el servidor remoto en esta PC.',
      'central_machine_local_reset_failed',
    );
  }
  return reset;
};

export const reconcileCentralOverride = async ({
  desktop,
  centralMachine,
  candidate,
}) => {
  const assignedDeviceId = centralMachine?.machine?.device_id;
  if (
    centralMachine?.available === false
    || !assignedDeviceId
    || !candidate?.deviceId
  ) return { success: true, changed: false };

  if (assignedDeviceId !== candidate.deviceId) {
    return deactivateStaleCentralOverride({ desktop, centralMachine, candidate });
  }
  if (
    centralMachine?.lease_active !== true
    || candidate.centralMachineActive === true
    || !candidate.localServiceRunning
    || !candidate.localServiceReady
    || !candidate.whatsappConnected
    || typeof desktop?.activateWhatsAppCentralMachine !== 'function'
  ) return { success: true, changed: false };

  const activation = await desktop.activateWhatsAppCentralMachine(candidate.deviceId);
  if (!activation?.success) {
    throw codedError(
      activation?.error || 'No se pudo restaurar la ruta local de la central.',
      activation?.code || 'central_machine_local_restore_failed',
    );
  }
  return { ...activation, changed: true };
};

export const claimCentralMachineForDevice = async ({
  desktop,
  operator,
  candidate,
  currentCentralMachine,
}) => {
  if (
    typeof desktop?.activateWhatsAppCentralMachine !== 'function'
    || typeof desktop?.deactivateWhatsAppCentralMachine !== 'function'
  ) {
    throw codedError('Esta opción necesita la app de escritorio.', 'invalid_central_machine');
  }
  if (!candidate?.localServiceRunning || !candidate?.localServiceReady) {
    throw codedError(
      'El servidor local de WhatsApp todavía no está listo en esta PC.',
      'local_whatsapp_service_unavailable',
    );
  }
  if (!candidate?.whatsappConnected) {
    throw codedError(
      'WhatsApp todavía no está conectado en esta PC.',
      'central_whatsapp_disconnected',
    );
  }

  const activation = await desktop.activateWhatsAppCentralMachine(candidate.deviceId);
  if (!activation?.success) {
    throw codedError(
      activation?.error || 'No se pudo activar esta PC como central.',
      activation?.code || 'central_machine_unavailable',
    );
  }

  const verifiedCandidate = activation.candidate || candidate;
  try {
    const claimed = await operator.claimCentralMachine({
      ...verifiedCandidate,
      expectedDeviceId: currentCentralMachine?.machine?.device_id || '',
    });
    return { claimed, candidate: verifiedCandidate };
  } catch (claimError) {
    const reset = await desktop.deactivateWhatsAppCentralMachine(candidate.deviceId)
      .catch(() => null);
    if (!reset?.success) {
      throw codedError(
        'No se pudo restaurar el servidor remoto después del fallo.',
        'central_machine_local_reset_failed',
      );
    }
    throw claimError;
  }
};
