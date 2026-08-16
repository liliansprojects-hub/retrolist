import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Folder, ChevronRight } from 'lucide-react';

// sorted, drag-to-reorder list of child folders (vertical rows). "custom"
// sort enables dragging by a left grip handle.
export default function ChildFoldersList({ folders, sort, setSort, onDragEnd }) {
  const navigate = useNavigate();
  const sorted = (() => {
    const arr = folders.slice();
    if (sort === 'newest') arr.sort((a, b) => (b.created_date || 0) - (a.created_date || 0));
    else if (sort === 'oldest') arr.sort((a, b) => (a.created_date || 0) - (b.created_date || 0));
    else if (sort === 'alpha') arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return arr;
  })();
  return (
    <div className="mb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="childfolders">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {sorted.map((c, index) => (
                <Draggable key={c.id} draggableId={c.id} index={index} isDragDisabled={sort !== 'custom'}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} className="flex items-stretch gap-0.5">
                      {sort === 'custom' && (
                        <div {...prov.dragHandleProps} className="flex items-center justify-center w-3 text-muted-foreground cursor-grab">
                          <GripVertical className="w-3 h-3" />
                        </div>
                      )}
                      <button onClick={() => navigate(`/folder/${c.id}`)} className="flex-1 flex items-center gap-3 p-3 rounded-2xl border border-border bg-card active:scale-[0.98] transition-transform text-left min-w-0">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.color || '#f4f4f5' }}>
                          <Folder className="w-5 h-5 text-foreground/70" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold lowercase truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground lowercase">{c.items?.length || 0} items</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}