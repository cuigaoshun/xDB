import { Search, Terminal, Database } from "lucide-react";
import { Input } from "@/components/ui/input";

export function RedisWorkspace({ name }: { name: string }) {
  return (
    <div className="h-full flex flex-col">
      {/* RedisInsight style header */}
      <div className="border-b p-3 flex justify-between items-center bg-muted/5">
        <div className="flex items-center gap-4">
            <h2 className="font-semibold text-sm">{name}</h2>
            <div className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Connected</div>
        </div>
        <div className="flex gap-2">
            <button className="p-1.5 hover:bg-accent rounded-md" title="CLI"><Terminal className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Filter Bar */}
        <div className="p-3 border-b flex gap-2">
           <div className="relative flex-1 max-w-md">
             <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input placeholder="Filter keys..." className="pl-8 h-9" />
           </div>
           <button className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md">+ Key</button>
        </div>

        {/* Key Browser */}
        <div className="flex-1 overflow-auto p-0">
           <table className="w-full text-sm text-left">
             <thead className="text-xs text-muted-foreground bg-muted/10 font-medium uppercase border-b">
                <tr>
                    <th className="px-4 py-2 w-12">Type</th>
                    <th className="px-4 py-2">Key</th>
                    <th className="px-4 py-2 w-24">TTL</th>
                    <th className="px-4 py-2 w-24">Size</th>
                </tr>
             </thead>
             <tbody className="divide-y">
                {[
                    { type: 'string', key: 'session:12345', ttl: '3600', size: '128B' },
                    { type: 'hash', key: 'user:1001', ttl: '-1', size: '2KB' },
                    { type: 'list', key: 'queue:jobs', ttl: '-1', size: '45 items' },
                    { type: 'set', key: 'tags:active', ttl: '-1', size: '12 members' },
                ].map((item) => (
                    <tr key={item.key} className="hover:bg-accent/50 cursor-pointer">
                        <td className="px-4 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                item.type === 'string' ? 'border-blue-200 text-blue-600 bg-blue-50' :
                                item.type === 'hash' ? 'border-purple-200 text-purple-600 bg-purple-50' :
                                item.type === 'list' ? 'border-orange-200 text-orange-600 bg-orange-50' :
                                'border-gray-200 text-gray-600 bg-gray-50'
                            }`}>
                                {item.type.toUpperCase()}
                            </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-sm">{item.key}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.ttl}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.size}</td>
                    </tr>
                ))}
             </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
