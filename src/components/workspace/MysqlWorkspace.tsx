export function MysqlWorkspace({ name }: { name: string }) {
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar similar to Navicat */}
      <div className="border-b p-2 flex gap-2 items-center bg-muted/5">
        <button className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-sm">Query</button>
        <button className="px-3 py-1 text-xs font-medium bg-muted hover:bg-accent rounded-sm">Table</button>
        <button className="px-3 py-1 text-xs font-medium bg-muted hover:bg-accent rounded-sm">View</button>
        <div className="h-4 w-[1px] bg-border mx-2"></div>
        <button className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-sm">Run</button>
      </div>
      
      <div className="flex-1 flex">
         {/* Object List (Left) */}
        <div className="w-64 border-r p-2 bg-muted/5">
           <h3 className="text-xs font-bold text-muted-foreground mb-2 px-2">TABLES</h3>
           <div className="space-y-1">
             {['users', 'posts', 'comments', 'orders'].map(table => (
               <div key={table} className="px-2 py-1 text-sm hover:bg-accent cursor-pointer rounded-sm flex items-center gap-2">
                 <span className="w-3 h-3 bg-blue-400 rounded-[1px]"></span>
                 {table}
               </div>
             ))}
           </div>
        </div>

        {/* Query/Content Area (Right) */}
        <div className="flex-1 p-4 bg-background">
           <div className="text-sm text-muted-foreground mb-4">Connection: {name}</div>
           <div className="border rounded-md p-4 font-mono text-sm bg-muted/10 h-64">
             SELECT * FROM users LIMIT 10;
           </div>
           <div className="mt-4 border rounded-md h-40 flex items-center justify-center text-muted-foreground text-sm">
             Result Grid Placeholder
           </div>
        </div>
      </div>
    </div>
  );
}
