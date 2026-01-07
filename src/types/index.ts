import type { LucideIcon } from 'lucide-react';

// ============================================
// Category Types
// ============================================

export interface Subgroup {
    id: string;
    name: string;
    members: string;
    apiQuery?: string;
}

export interface LibraryItem {
    id: string;
    title: string;
    author: string;
    type?: string;
    readTime: string;
}

export interface Category {
    id: string;
    label: string;
    icon: LucideIcon;
    color: string;
    bgHover: string;
    description: string;
    apiSource: string;
    features: string[];
    subgroups: Subgroup[];
    library: LibraryItem[];
}

// ============================================
// Post Types
// ============================================

export interface FeedPost {
    id: number;
    author: string;
    role: string;
    isExpert: boolean;
    group: string;
    categoryId: string;
    time: string;
    title: string;
    content: string;
    likes: number;
    comments: number;
}

export interface PostAuthor {
    name: string;
    avatar: string | null;
    role: string;
}

export interface PostGroup {
    id: number;
    name: string;
    icon: string;
}

export interface PostDetail {
    id: number;
    title: string;
    content: string;
    author: PostAuthor;
    group: PostGroup;
    publishedAt: string;
    likes: number;
    comments: number;
    saved: boolean;
    image?: string;
}

// ============================================
// Group Types
// ============================================

export interface RecentPost {
    id: number;
    title: string;
    author: string;
    time: string;
}

export interface Member {
    id: number;
    name: string;
    role: string;
    posts: number;
}

export interface GroupDetail {
    id: number;
    name: string;
    description: string;
    members: number;
    postsPerWeek: number;
    categoryId: string;
    icon: string;
    recentPosts: RecentPost[];
    topMembers: Member[];
}

// ============================================
// Collaboration Types
// ============================================

export interface Collaboration {
    id: number;
    title: string;
    context: string;
    author: string;
    tags: string[];
    time: string;
}

// ============================================
// Event Types
// ============================================

export interface EventItem {
    id: number;
    title: string;
    date: string;
    location: string;
    attendees: number;
}

// ============================================
// Publication Types (Discover Page)
// ============================================

export interface Publication {
    id: number;
    group: string;
    category: string;
    categoryId: string;
    image: string;
    likes: string;
    comments: string;
}

export interface RecommendedGroup {
    id: number;
    name: string;
    categoryId: string;
    description: string;
    members: string;
    posts: string;
    icon: string;
}

// ============================================
// Conversation Types (Feed Page)
// ============================================

export interface Conversation {
    id: number;
    name: string;
    type?: string;
    icon?: string;
    lastMessage: string;
    time: string;
    unread: number;
}

// ============================================
// Library Types
// ============================================

export interface Folder {
    id: number;
    name: string;
    count: number;
    icon: string;
}

export interface RecentItem {
    id: number;
    title: string;
    collection: string;
    time: string;
    icon?: string;
    hasImage?: boolean;
}

// ============================================
// Global Library Types
// ============================================

export interface GlobalLibraryHighlight {
    id: number;
    title: string;
    author: string;
    readTime: string;
    category: string;
}

// ============================================
// App State Types
// ============================================

export interface AppStateContextType {
    joinedGroups: number[];
    savedCategories: string[];
    likedPosts: number[];
    savedPosts: number[];
    toggleJoinGroup: (groupId: number) => void;
    toggleSaveCategory: (categoryId: string) => void;
    toggleLikePost: (postId: number) => void;
    toggleSavePost: (postId: number) => void;
    isGroupJoined: (groupId: number) => boolean;
    isCategorySaved: (categoryId: string) => boolean;
    isPostLiked: (postId: number) => boolean;
    isPostSaved: (postId: number) => boolean;
}

// ============================================
// Toast Types
// ============================================

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
    message: string;
    type: ToastType;
    id: number;
}

export interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    hideToast: () => void;
}

// ============================================
// Component Props Types
// ============================================

export interface LoginScreenProps {
    onLogin: () => void;
}

export interface OnboardingFlowProps {
    onComplete: () => void;
}

export interface SidebarItemProps {
    icon: LucideIcon;
    active: boolean;
    onClick: () => void;
    tooltip: string;
}

export interface PostCardProps {
    post: FeedPost;
}

export interface CategoryCardProps {
    category: Category;
    isSaved: boolean;
    onToggleSave: () => void;
}

export interface SearchFiltersProps {
    isOpen: boolean;
    onClose: () => void;
    filters: {
        category: string | null;
        sortBy: string;
    };
    onApply: (filters: { category: string | null; sortBy: string }) => void;
}
