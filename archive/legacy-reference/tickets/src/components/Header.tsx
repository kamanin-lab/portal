import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import kamaninLogo from '@/assets/K-logo.png';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Settings, HelpCircle, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import FeedbackDialog from '@/components/FeedbackDialog';
const Header = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user,
    profile,
    signOut
  } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Benutzer';
  const userEmail = user?.email || 'user@example.com';
  const userCompany = profile?.company_name || 'Unternehmen';
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const handleLogout = async () => {
    const {
      error
    } = await signOut();
    if (error) {
      toast({
        title: 'Fehler beim Abmelden',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Abgemeldet',
        description: 'Sie wurden erfolgreich abgemeldet.'
      });
      navigate('/auth');
    }
  };
  return <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/dashboard" className="flex items-center space-x-2">
          <img src={kamaninLogo} alt="KAMANIN" className="h-8 w-auto" />
          <span className="text-sm text-muted-foreground">Client Portal</span>
        </Link>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setFeedbackOpen(true)} className="text-muted-foreground hover:text-foreground">
            <MessageSquare className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/help')} className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Hilfe</span>
          </Button>
          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
          
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                <p className="text-xs leading-none text-muted-foreground">{userCompany}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Einstellungen</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Abmelden</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>;
};
export default Header;
