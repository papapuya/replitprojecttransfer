import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Search, Columns, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export interface ColumnConfig {
  key: string;
  label: string;
  visible?: boolean;
  required?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

interface UnifiedDataPreviewProps {
  // Core data
  data: any[];
  columns: ColumnConfig[];
  
  // Display
  title?: string;
  description?: string;
  emptyMessage?: string;
  
  // Features
  enableColumnSelection?: boolean;
  enableExport?: boolean;
  enablePagination?: boolean;
  enableSearch?: boolean;
  enableRowNumbers?: boolean;
  
  // Pagination
  itemsPerPage?: number;
  
  // Export
  exportFileName?: string;
  onExport?: () => void;
  
  // Mode-specific
  mode?: 'default' | 'compact' | 'zebra';
  stickyHeader?: boolean;
  
  // Filter options
  showOnlyFilledFields?: boolean;
  
  // Actions
  actions?: React.ReactNode;
}

export function UnifiedDataPreview({
  data,
  columns: initialColumns,
  title,
  description,
  emptyMessage = "Keine Daten vorhanden",
  enableColumnSelection = true,
  enableExport = true,
  enablePagination = true,
  enableSearch = false,
  enableRowNumbers = false,
  itemsPerPage = 10,
  exportFileName = "export",
  onExport,
  mode = 'default',
  stickyHeader = true,
  showOnlyFilledFields = false,
  actions,
}: UnifiedDataPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [userModifiedColumns, setUserModifiedColumns] = useState(false);
  const [hideEmptyFields, setHideEmptyFields] = useState(showOnlyFilledFields);

  // Sync visible columns when initialColumns change (async data loading)
  useEffect(() => {
    // Only auto-update if user hasn't manually modified columns
    if (!userModifiedColumns && initialColumns.length > 0) {
      const defaultVisible = initialColumns
        .filter(col => col.visible !== false)
        .map(col => col.key);
      setVisibleColumns(defaultVisible);
    }
  }, [initialColumns, userModifiedColumns]);

  // Filter columns based on visibility and empty field hiding
  const columns = useMemo(() => {
    let filtered = initialColumns.filter(col => visibleColumns.includes(col.key));
    
    if (hideEmptyFields) {
      filtered = filtered.filter(col => {
        return data.some(row => {
          const value = row[col.key];
          return value !== null && value !== undefined && value !== '';
        });
      });
    }
    
    return filtered;
  }, [initialColumns, visibleColumns, hideEmptyFields, data]);

  // Search filter
  const filteredData = useMemo(() => {
    if (!enableSearch || !searchQuery.trim()) return data;
    
    const query = searchQuery.toLowerCase();
    return data.filter(row =>
      Object.values(row).some(value =>
        String(value || '').toLowerCase().includes(query)
      )
    );
  }, [data, searchQuery, enableSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    if (!enablePagination) return filteredData;
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredData.slice(start, end);
  }, [filteredData, currentPage, itemsPerPage, enablePagination]);

  // Export to CSV
  const handleExport = () => {
    if (onExport) {
      onExport();
      return;
    }
    
    const headers = columns.map(col => col.label);
    const csvContent = [
      headers.join(';'),
      ...filteredData.map(row =>
        columns.map(col => {
          const value = row[col.key];
          const strValue = String(value || '').replace(/;/g, ',');
          return `"${strValue}"`;
        }).join(';')
      )
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${exportFileName}.csv`;
    link.click();
  };

  // Toggle column visibility
  const toggleColumn = (columnKey: string) => {
    setUserModifiedColumns(true);
    setVisibleColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  };

  // Select all/none columns
  const selectAllColumns = () => {
    setUserModifiedColumns(true);
    setVisibleColumns(initialColumns.map(col => col.key));
  };

  const deselectAllColumns = () => {
    setUserModifiedColumns(true);
    setVisibleColumns(initialColumns.filter(col => col.required).map(col => col.key));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          
          <div className="flex items-center gap-2">
            {actions}
            
            {showOnlyFilledFields && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHideEmptyFields(!hideEmptyFields)}
              >
                {hideEmptyFields ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                {hideEmptyFields ? 'Alle Felder' : 'Nur gefüllte'}
              </Button>
            )}
            
            {enableColumnSelection && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns className="h-4 w-4 mr-2" />
                    Spalten ({visibleColumns.length}/{initialColumns.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Spalten anzeigen</h4>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={selectAllColumns}>
                          Alle
                        </Button>
                        <Button variant="ghost" size="sm" onClick={deselectAllColumns}>
                          Keine
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                      {initialColumns.map(col => (
                        <div key={col.key} className="flex items-center space-x-2">
                          <Checkbox
                            id={`col-${col.key}`}
                            checked={visibleColumns.includes(col.key)}
                            onCheckedChange={() => toggleColumn(col.key)}
                            disabled={col.required}
                          />
                          <Label
                            htmlFor={`col-${col.key}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {col.label}
                            {col.required && <Badge variant="secondary" className="ml-2 text-xs">Pflicht</Badge>}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {enableExport && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                CSV Exportieren
              </Button>
            )}
          </div>
        </div>
        
        {enableSearch && (
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {filteredData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className={stickyHeader ? "sticky top-0 bg-background z-10" : ""}>
                    <TableRow>
                      {enableRowNumbers && (
                        <TableHead className="w-[60px]">#</TableHead>
                      )}
                      {columns.map(col => (
                        <TableHead key={col.key}>{col.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((row, index) => (
                      <TableRow
                        key={index}
                        className={mode === 'zebra' && index % 2 === 0 ? 'bg-muted/50' : ''}
                      >
                        {enableRowNumbers && (
                          <TableCell className="text-muted-foreground">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </TableCell>
                        )}
                        {columns.map(col => (
                          <TableCell key={col.key}>
                            {col.render
                              ? col.render(row[col.key], row)
                              : (row[col.key] !== null && row[col.key] !== undefined && row[col.key] !== '')
                                ? String(row[col.key])
                                : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            {enablePagination && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Zeige {((currentPage - 1) * itemsPerPage) + 1} bis {Math.min(currentPage * itemsPerPage, filteredData.length)} von {filteredData.length} Einträgen
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="text-sm">
                    Seite {currentPage} von {totalPages}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
