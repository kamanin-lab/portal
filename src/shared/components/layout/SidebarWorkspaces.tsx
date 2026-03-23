import { NavLink } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ClipboardIcon,
  Folder01Icon,
  DashboardSquare01Icon,
  CustomerServiceIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import type { ClientWorkspace } from '@/shared/hooks/useWorkspaces'
import { useProjects } from '@/modules/projects/hooks/useProjects'
import { WORKSPACE_ROUTES, WORKSPACE_CHILDREN } from '@/shared/lib/workspace-routes'
import type { IconSvgElement } from '@hugeicons/react'

const DEFAULT_WORKSPACES: ClientWorkspace[] = [
  { id: 'default-projects', profile_id: '', module_key: 'projects', display_name: 'Projekte', icon: 'folder-kanban', sort_order: 1, is_active: true, created_at: '' },
  { id: 'default-tickets', profile_id: '', module_key: 'tickets', display_name: 'Aufgaben', icon: 'clipboard-list', sort_order: 2, is_active: true, created_at: '' },
  { id: 'default-files', profile_id: '', module_key: 'files', display_name: 'Dateien', icon: 'folder', sort_order: 3, is_active: true, created_at: '' },
]

const ICON_MAP: Record<string, IconSvgElement> = {
  'clipboard-list': ClipboardIcon,
  'folder-kanban': DashboardSquare01Icon,
  'folder': Folder01Icon,
  'headset': CustomerServiceIcon,
  'box': DashboardSquare01Icon,
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
  const { projects } = useProjects()

  // Build dynamic children for projects workspace
  const projectChildren = projects.map((p) => ({
    path: `/projekte?id=${p.id}`,
    label: p.name,
    icon: 'folder-kanban',
  }))

  return (
    <div className="py-1">
      {expanded && (
        <div className="px-5 pb-1.5 pt-0.5 text-[10px] uppercase tracking-[2px] text-text-sidebar/60 font-medium whitespace-nowrap">
          Workspaces
        </div>
      )}
      {visibleWorkspaces.map((ws) => {
        const iconObj = ICON_MAP[ws.icon] ?? DashboardSquare01Icon
        const rootPath = WORKSPACE_ROUTES[ws.module_key] ?? '/'
        const staticChildren = WORKSPACE_CHILDREN[ws.module_key] ?? []
        // For projects workspace, use dynamically populated children
        const children = ws.module_key === 'projects' ? projectChildren : staticChildren

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
              <HugeiconsIcon icon={iconObj} size={20} className="shrink-0" />
              {expanded && (
                <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">{ws.display_name}</span>
              )}
            </NavLink>

            {expanded && children.map((child) => {
              const childIconObj = ICON_MAP[child.icon] ?? DashboardSquare01Icon
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
                  <HugeiconsIcon icon={childIconObj} size={15} className="shrink-0" />
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
