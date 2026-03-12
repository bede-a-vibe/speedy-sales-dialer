import { Contact } from "@/data/mockData";
import { Phone, Mail, Globe, MapPin, ExternalLink, User } from "lucide-react";

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{contact.business_name}</h3>
          {contact.contact_person && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <User className="h-3.5 w-3.5" />
              {contact.contact_person}
            </p>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-widest font-mono bg-accent text-accent-foreground px-2 py-1 rounded">
          {contact.industry}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={`tel:${contact.phone}`}
          className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2.5 text-primary hover:bg-primary/20 transition-colors group"
        >
          <Phone className="h-4 w-4 group-hover:animate-pulse" />
          <span className="font-mono text-sm font-semibold">{contact.phone}</span>
        </a>

        <a
          href={`mailto:${contact.email}`}
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Mail className="h-4 w-4" />
          <span className="text-sm truncate">{contact.email}</span>
        </a>

        <a
          href={contact.website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm truncate">Website</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>

        <a
          href={contact.gmb_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <MapPin className="h-4 w-4" />
          <span className="text-sm truncate">GMB Profile</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>
      </div>

      {(contact.city || contact.state) && (
        <p className="text-xs text-muted-foreground font-mono">
          📍 {[contact.city, contact.state].filter(Boolean).join(", ")}
        </p>
      )}
    </div>
  );
}
