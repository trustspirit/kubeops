import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Bookmark {
  id: string;
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  label?: string;
  createdAt: number;
}

function bookmarkKey(b: { clusterId: string; namespace: string; resourceType: string; resourceName: string }) {
  return `${b.clusterId}/${b.namespace}/${b.resourceType}/${b.resourceName}`;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (clusterId: string, namespace: string, resourceType: string, resourceName: string) => boolean;
  getBookmark: (clusterId: string, namespace: string, resourceType: string, resourceName: string) => Bookmark | undefined;
  updateLabel: (id: string, label: string) => void;
  removeByResource: (clusterId: string, namespace: string, resourceType: string, resourceName: string) => void;
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      addBookmark: (bookmark) => {
        const key = bookmarkKey(bookmark);
        const { bookmarks } = get();
        if (bookmarks.some((b) => bookmarkKey(b) === key)) return;
        set({
          bookmarks: [
            ...bookmarks,
            {
              ...bookmark,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
            },
          ],
        });
      },
      removeBookmark: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        }));
      },
      isBookmarked: (clusterId, namespace, resourceType, resourceName) => {
        const key = bookmarkKey({ clusterId, namespace, resourceType, resourceName });
        return get().bookmarks.some((b) => bookmarkKey(b) === key);
      },
      getBookmark: (clusterId, namespace, resourceType, resourceName) => {
        const key = bookmarkKey({ clusterId, namespace, resourceType, resourceName });
        return get().bookmarks.find((b) => bookmarkKey(b) === key);
      },
      updateLabel: (id, label) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, label } : b
          ),
        }));
      },
      removeByResource: (clusterId, namespace, resourceType, resourceName) => {
        const key = bookmarkKey({ clusterId, namespace, resourceType, resourceName });
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => bookmarkKey(b) !== key),
        }));
      },
    }),
    {
      name: 'kubeops-bookmarks',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
