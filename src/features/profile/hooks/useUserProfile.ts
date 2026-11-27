import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppError } from '@/shared/lib/errors';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  getUserProfile,
  getFollowStatus,
  getAccountVisibilityServer,
  sendFollowRequest,
  acceptFollowRequest,
  declineFollowRequest,
  cancelFollowRequest,
  followPublicUser,
  unfollowUser,
  blockUser,
  unblockUser,
  reportUserProfile,
  getOrCreateDirectConversation,
  isUserBlocked,
  type FollowStatus,
  type UserProfileRead,
  type UserReportReason,
} from '@/features/profile/api';

const isPermissionDeniedError = (err: unknown): boolean => {
  if (err instanceof AppError) return err.code === 'PERMISSION_DENIED';
  const code = (err as { code?: unknown })?.code;
  return code === 'permission-denied' || code === 'PERMISSION_DENIED';
};

/**
 * Someone else's profile and where the signed-in person stands with them: following, a request
 * either way, blocked. Every action keeps the counters right at once and reads the profile again
 * a moment later, when the server has counted it.
 */
export function useUserProfile(userId: string | undefined) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfileRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState<FollowStatus>('none');
  const [hasIncomingRequest, setHasIncomingRequest] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<UserReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const activeUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    activeUserIdRef.current = userId;
    setReportOpen(false);
    setReportReason('spam');
    setReportDetails('');
    setReportError(null);
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [userId]);

  const scheduleProfileRefresh = (targetUid: string) => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      if (activeUserIdRef.current !== targetUid) return;
      void getUserProfile(targetUid)
        .then((fresh) => {
          if (activeUserIdRef.current === targetUid && fresh) {
            setProfile(fresh);
          }
        })
        .catch(() => undefined);
    }, 1200);
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const shouldCheckBlock = Boolean(currentUser && currentUser.uid !== userId);
        const [userProfile, blocked] = await Promise.all([
          getUserProfile(userId),
          shouldCheckBlock && currentUser
            ? isUserBlocked(currentUser.uid, userId).catch(() => false)
            : Promise.resolve(false),
        ]);
        if (!isMounted || activeUserIdRef.current !== userId) return;

        setProfile(userProfile);
        setBlockedByMe(blocked);

        if (currentUser && userProfile && currentUser.uid !== userId && !blocked) {
          const status = await getFollowStatus(
            currentUser.uid,
            userId,
            userProfile.accountVisibility,
          );
          if (!isMounted || activeUserIdRef.current !== userId) return;

          const outgoingStatus: FollowStatus =
            status.status === 'pending_received'
              ? 'none'
              : userProfile.accountVisibility !== 'private' && status.status === 'pending_sent'
                ? 'none'
                : status.status;
          setFollowStatus(outgoingStatus);
          setHasIncomingRequest(Boolean(status.hasIncomingRequest));
          setIsMutual(!!status.isMutual);
        } else {
          setFollowStatus('none');
          setHasIncomingRequest(false);
          setIsMutual(false);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        if (isMounted && activeUserIdRef.current === userId) {
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [userId, currentUser]);

  const follow = async () => {
    if (!currentUser || !userId || !profile) return;

    try {
      const blocked = await isUserBlocked(currentUser.uid, userId);
      if (blocked) {
        setBlockedByMe(true);
        showToast('Desbloquea a este usuario para poder seguirlo', 'info');
        return;
      }
    } catch (err) {
      console.error('Error checking block status:', err);
    }

    setActionLoading(true);
    try {
      const visibility = await getAccountVisibilityServer(userId);
      if (visibility !== profile.accountVisibility) {
        setProfile((prev) => (prev ? { ...prev, accountVisibility: visibility } : prev));
      }
      if (visibility === 'private') {
        try {
          await sendFollowRequest(currentUser.uid, userId);
          setFollowStatus('pending_sent');
          showToast('Solicitud enviada', 'success');
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            const fallbackVisibility = await getAccountVisibilityServer(userId);
            if (fallbackVisibility !== 'private') {
              await followPublicUser(currentUser.uid, userId);
              const status = await getFollowStatus(currentUser.uid, userId, fallbackVisibility);
              setFollowStatus(status.status === 'pending_received' ? 'none' : status.status);
              setHasIncomingRequest(Boolean(status.hasIncomingRequest));
              setIsMutual(!!status.isMutual);
              setProfile((prev) =>
                prev ? { ...prev, followersCount: (prev.followersCount ?? 0) + 1 } : prev,
              );
              scheduleProfileRefresh(userId);
              showToast('Siguiendo', 'success');
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      } else {
        try {
          await Promise.allSettled([cancelFollowRequest(currentUser.uid, userId)]);
          await followPublicUser(currentUser.uid, userId);
          const status = await getFollowStatus(currentUser.uid, userId, visibility);
          setFollowStatus(status.status === 'pending_received' ? 'none' : status.status);
          setHasIncomingRequest(Boolean(status.hasIncomingRequest));
          setIsMutual(!!status.isMutual);
          setProfile((prev) =>
            prev ? { ...prev, followersCount: (prev.followersCount ?? 0) + 1 } : prev,
          );
          scheduleProfileRefresh(userId);
          showToast('Siguiendo', 'success');
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            const fallbackVisibility = await getAccountVisibilityServer(userId);
            if (fallbackVisibility === 'private') {
              await sendFollowRequest(currentUser.uid, userId);
              setProfile((prev) => (prev ? { ...prev, accountVisibility: 'private' } : prev));
              setFollowStatus('pending_sent');
              setIsMutual(false);
              showToast('Solicitud enviada', 'success');
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      const message = isPermissionDeniedError(err)
        ? 'No se pudo seguir a este usuario en este momento.'
        : err instanceof Error
          ? err.message
          : 'Error al seguir usuario';
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const acceptRequest = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await acceptFollowRequest(userId, currentUser.uid);
      setHasIncomingRequest(false);
      setIsMutual(followStatus === 'following');
      setProfile((prev) =>
        prev ? { ...prev, followingCount: (prev.followingCount ?? 0) + 1 } : prev,
      );
      scheduleProfileRefresh(userId);
      showToast('Solicitud aceptada', 'success');
    } catch {
      showToast('Error al aceptar solicitud', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const declineRequest = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await declineFollowRequest(userId, currentUser.uid);
      setHasIncomingRequest(false);
      showToast('Solicitud rechazada', 'info');
    } catch {
      showToast('Error al rechazar solicitud', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelRequest = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await cancelFollowRequest(currentUser.uid, userId);
      setFollowStatus('none');
      setIsMutual(false);
      showToast('Solicitud cancelada', 'info');
    } catch {
      showToast('Error al cancelar solicitud', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const unfollow = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await unfollowUser(currentUser.uid, userId);
      setFollowStatus('none');
      setIsMutual(false);
      setProfile((prev) =>
        prev ? { ...prev, followersCount: Math.max(0, (prev.followersCount ?? 0) - 1) } : prev,
      );
      scheduleProfileRefresh(userId);
      showToast('Dejaste de seguir', 'info');
    } catch {
      showToast('Error al dejar de seguir', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /** Returns true when the person was blocked. */
  const block = async (): Promise<boolean> => {
    if (!currentUser || !userId || currentUser.uid === userId || actionLoading) return false;
    setActionLoading(true);
    try {
      await blockUser(currentUser.uid, userId);
      setBlockedByMe(true);
      setFollowStatus('none');
      setHasIncomingRequest(false);
      setIsMutual(false);
      showToast('Usuario bloqueado', 'success');
      return true;
    } catch {
      showToast('No se pudo bloquear al usuario', 'error');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const unblock = async () => {
    if (!currentUser || !userId || !profile || actionLoading) return;
    setActionLoading(true);
    try {
      await unblockUser(currentUser.uid, userId);
      setBlockedByMe(false);
      const status = await getFollowStatus(currentUser.uid, userId, profile.accountVisibility);
      setFollowStatus(status.status === 'pending_received' ? 'none' : status.status);
      setHasIncomingRequest(Boolean(status.hasIncomingRequest));
      setIsMutual(!!status.isMutual);
      showToast('Usuario desbloqueado', 'info');
    } catch {
      showToast('No se pudo desbloquear al usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const resetReportForm = () => {
    setReportReason('spam');
    setReportDetails('');
    setReportError(null);
  };

  const submitReport = async () => {
    if (!currentUser || !userId || currentUser.uid === userId || isSubmittingReport) return;
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      await reportUserProfile({
        reporterUid: currentUser.uid,
        reportedUid: userId,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportOpen(false);
      resetReportForm();
      showToast('Reporte enviado', 'success');
    } catch {
      setReportError('No se pudo enviar el reporte. Intenta de nuevo.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const sendMessage = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      const blocked = await isUserBlocked(currentUser.uid, userId);
      if (blocked) {
        setBlockedByMe(true);
        showToast('Desbloquea a este usuario para enviarle mensajes', 'info');
        return;
      }
      const conversationId = await getOrCreateDirectConversation(currentUser.uid, userId);
      navigate(`/messages?conversation=${conversationId}`);
    } catch {
      showToast('Error al crear conversación', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const isOwner = !!currentUser && currentUser.uid === userId;
  const isPrivate = profile?.accountVisibility === 'private';
  const canViewContent =
    !blockedByMe && (!isPrivate || isOwner || isMutual || followStatus === 'following');

  return {
    profile,
    loading,
    isSignedIn: !!currentUser,
    isOwner,
    isPrivate,
    followStatus,
    hasIncomingRequest,
    isMutual,
    blockedByMe,
    actionLoading,
    /** Posts, contributions and the follow lists. */
    canViewContent,
    canMessage: !isPrivate || isMutual || followStatus === 'following',
    follow,
    unfollow,
    cancelRequest,
    acceptRequest,
    declineRequest,
    block,
    unblock,
    sendMessage,
    report: {
      open: reportOpen,
      reason: reportReason,
      details: reportDetails,
      error: reportError,
      submitting: isSubmittingReport,
      show: () => setReportOpen(true),
      close: () => {
        if (isSubmittingReport) return;
        setReportOpen(false);
        resetReportForm();
      },
      setReason: setReportReason,
      setDetails: setReportDetails,
      submit: submitReport,
    },
  };
}
