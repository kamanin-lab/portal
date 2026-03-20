import { NavLink } from 'react-router-dom'
import { ClipboardList, FolderKanban, Headset, Box } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ClientWorkspace } from '@/shared/hooks/useWorkspaces'
import { WORKSPACE_ROUTES, WORKSPACE_CHILDREN } from '@/shared/lib/workspace-routes'

const DEFAULT_WORKSPACES: ClientWorkspace[] = [
  { id: 'default-projects', profile_id: '', module_key: 'projects', display_name: 'Projekte', icon: 'folder-kanban', sort_order: 1, is_active: true, created_at: '' },
  { id: 'default-tickets', profile_id: '', module_key: 'tickets', display_name: 'Aufgaben', icon: 'clipboard-list', sort_order: 2, is_active: true, created_at: '' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'clipboard-list': ClipboardList,
  'folder-kanban': FolderKanban,
  'headset': Headset,
  'box': Box,
}

interface Props {
  expanded: boolean
  workspaces: ClientWorkspace[]
  supportUnread: number
}

function WorkspaceBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="min-w-[16px] h-[16px] px-[4px] rounded-full bg-cta text-white text-[9px] font-bold flex items-center justify-center leading-none ml-auto shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function SidebarWorkspaces({ expanded, workspaces, supportUnread }: Props) {
  const visibleWorkspaces = workspaces.length > 0 ? workspaces : DEFAULT_WORKSPACES

  return (
    <div className="py-1">
      {expanded && (
        <div className="px-5 pb-1.5 pt-0.5 text-[10px] uppercase tracking-[2px] text-text-sidebar/60 font-medium whitespace-nowrap">
          Workspaces
        </div>
      )}
      {visibleWorkspaces.map((ws) => {
        const IconComp = ICON_MAP[ws.icon] ?? Box
        const rootPath = WORKSPACE_ROUTES[ws.module_key] ?? '/'
        const children = WORKSPACE_CHILDREN[ws.module_key] ?? []

        return (
          <div key={ws.id}>
            <NavLink
              to={rootPath}
              end
              className={({ isActive }) => cn(
                'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
                'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
                isActive && 'bg-sidebar-active text-white'
              )}
            >
              <IconComp size={18} />
              {expanded && (
                <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">{ws.display_name}</span>
              )}
            </NavLink>

            {expanded && children.map((child) => {
              const ChildIcon = ICON_MAP[child.icon] ?? Box
              const badge = child.path === '/support' ? supportUnread : 0
              return (
                <NavLink
                  key={child.path}
                  to={child.path}
                  className={({ isActive }) => cn(
                    'flex items-center h-9 pl-9 pr-3.5 mx-1.5 rounded-[8px] transition-colors',
                    'text-text-sidebar/80 hover:bg-sidebar-hover hover:text-white text-[13px]',
                    isActive && 'bg-sidebar-active text-white'
                  )}
                >
                  <ChildIcon size={15} className="shrink-0" />
                  <span className="ml-2.5 whitespace-nowrap overflow-hidden flex-1">{child.label}</span>
                  <WorkspaceBadge count={badge} />
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
