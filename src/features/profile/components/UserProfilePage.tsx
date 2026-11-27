import { useState } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/shared/ui/Toast';
import ContentReportModal from '@/features/posts/components/ContentReportModal';
import ProfilePostsGrid from '@/features/posts/components/ProfilePostsGrid';
import ContributionsSection from '@/features/profile/components/ContributionsSection';
import ProfileStats from '@/features/profile/components/ProfileStats';
import ReputationSection from '@/features/profile/components/ReputationSection';
import UserProfileHeader, {
  FollowButton,
  IncomingRequestNotice,
  MessageButton,
  ProfileOptionsMenu,
} from '@/features/profile/components/UserProfileHeader';
import { useUserProfile } from '@/features/profile/hooks/useUserProfile';
import { profileSectionTitle } from '@/features/profile/model/profileStyles';

const count = (value: unknown) => (typeof value === 'number' ? value : 0);

/** Confirms a block, saying what it does. */
function BlockUserDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center safe-area-inset"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-block-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <h3 id="profile-block-modal-title" className="text-lg font-medium text-white">
            Bloquear usuario
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-neutral-400">
            No podrán enviarse mensajes ni ver sus publicaciones, y se eliminará el seguimiento
            entre ambos. Puedes desbloquearlo desde Ajustes &gt; Privacidad y seguridad.
          </p>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-neutral-300 transition-colors hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? 'Bloqueando...' : 'Confirmar bloqueo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] px-6 py-14 text-center">
      <p className="mb-2 text-lg font-light text-white">{title}</p>
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

/**
 * Someone else's profile, laid out like your own: the header with Seguir and Mensaje (block and
 * report in "⋯"), the counters, then their posts and contributions next to their reputation.
 * The data and actions live in useUserProfile.
 */
const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const person = useUserProfile(userId);
  const [isBlocking, setIsBlocking] = useState(false);
  const { profile } = person;

  if (person.loading) {
    return (
      <div className="page-profile flex h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-profile flex h-[60vh] flex-col items-center justify-center text-neutral-600">
        <p className="mb-4 font-serif text-lg italic">Usuario no encontrado</p>
        <button onClick={() => navigate(-1)} className="text-sm text-white underline">
          Volver
        </button>
      </div>
    );
  }

  const displayName = profile.displayName || 'Usuario';
  const showActions = person.isSignedIn && !person.isOwner;

  const actions = !showActions ? null : person.blockedByMe ? (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void person.unblock()}
        disabled={person.actionLoading}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/40 px-5 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50 sm:flex-none"
      >
        {person.actionLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          'Desbloquear usuario'
        )}
      </button>
      <ProfileOptionsMenu busy={person.actionLoading} onReport={person.report.show} />
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <FollowButton
        status={person.followStatus}
        busy={person.actionLoading}
        onFollow={() => void person.follow()}
        onUnfollow={() => void person.unfollow()}
        onCancelRequest={() => void person.cancelRequest()}
      />
      {person.canMessage && (
        <MessageButton busy={person.actionLoading} onClick={() => void person.sendMessage()} />
      )}
      <ProfileOptionsMenu
        busy={person.actionLoading}
        onBlock={() => setIsBlocking(true)}
        onReport={person.report.show}
      />
    </div>
  );

  const openFollowList = (tab: 'followers' | 'following') => {
    if (!userId) return;
    if (!person.canViewContent) {
      showToast('Esta cuenta es privada', 'info');
      return;
    }
    navigate(`/user/${userId}/connections?tab=${tab}`);
  };

  return (
    <div className="page-profile mx-auto max-w-4xl pb-32 pt-6">
      <button
        onClick={() => navigate(-1)}
        className="group mb-6 flex items-center text-xs uppercase tracking-widest text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ChevronLeft size={14} className="mr-2 transition-transform group-hover:-translate-x-1" />
        Volver
      </button>

      <UserProfileHeader
        displayName={displayName}
        photoURL={profile.photoURL ?? null}
        role={profile.role ?? null}
        location={profile.location ?? null}
        bio={profile.bio ?? null}
        actions={actions}
        request={
          showActions && !person.blockedByMe && person.hasIncomingRequest ? (
            <IncomingRequestNotice
              name={displayName}
              busy={person.actionLoading}
              onAccept={() => void person.acceptRequest()}
              onDecline={() => void person.declineRequest()}
            />
          ) : null
        }
      />

      <div className="mt-8">
        <ProfileStats
          posts={count(profile.postsCount)}
          followers={count(profile.followersCount)}
          following={count(profile.followingCount)}
          onOpenFollowers={() => openFollowList('followers')}
          onOpenFollowing={() => openFollowList('following')}
          listsDisabled={!person.canViewContent}
        />
      </div>

      {/* Phones: the posts first, the details after them. Wide screens: details on the left. */}
      <div className="mt-10 grid grid-cols-1 gap-12 md:grid-cols-3">
        <div className="md:order-2 md:col-span-2">
          {person.canViewContent ? (
            <div className="space-y-10">
              <ProfilePostsGrid userId={profile.uid} canView={person.canViewContent} />
              <ContributionsSection userId={profile.uid} canEdit={false} />
            </div>
          ) : person.blockedByMe ? (
            <Notice title="Has bloqueado a este usuario">
              Desbloquéalo para volver a ver sus publicaciones y enviarle mensajes.
            </Notice>
          ) : (
            <Notice title="Cuenta privada">Sigue a este usuario para ver sus publicaciones.</Notice>
          )}
        </div>

        <aside className="space-y-8 md:order-1">
          <ReputationSection
            reputation={profile.reputation || 0}
            karmaByInterest={profile.karmaByInterest ?? null}
          />
          <section>
            <h2 className={profileSectionTitle}>Miembro desde</h2>
            <p className="text-sm text-neutral-400">
              {profile.createdAt?.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }) ||
                'Fecha desconocida'}
            </p>
          </section>
        </aside>
      </div>

      {isBlocking && (
        <BlockUserDialog
          busy={person.actionLoading}
          onCancel={() => setIsBlocking(false)}
          onConfirm={() => {
            void person.block().then((blocked) => {
              if (blocked) setIsBlocking(false);
            });
          }}
        />
      )}

      <ContentReportModal
        open={person.report.open}
        targetLabel="usuario"
        reason={person.report.reason}
        details={person.report.details}
        error={person.report.error}
        isSubmitting={person.report.submitting}
        onClose={person.report.close}
        onReasonChange={person.report.setReason}
        onDetailsChange={person.report.setDetails}
        onSubmit={() => void person.report.submit()}
      />
    </div>
  );
};

export default UserProfilePage;
