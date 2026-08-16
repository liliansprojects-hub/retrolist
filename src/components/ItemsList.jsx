import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import ItemRow from './ItemRow';

// sorted, drag-to-reorder list of items. "custom" sort enables dragging by a
// left grip handle; newest/oldest/a–z are read-only sorted views.
export default function ItemsList({ items, sort, setSort, onDragEnd, folderType, folderId, onUpdate, onOpen, emptyText }) {
  const sorted = (() => {
    const arr = items.slice();
    if (sort === 'newest') arr.sort((a, b) => (b.created_date || 0) - (a.created_date || 0));
    else if (sort === 'oldest') arr.sort((a, b) => (a.created_date || 0) - (b.created_date || 0));
    else if (sort === 'alpha') arr.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    return arr;
  })();
  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="items">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {sorted.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={sort !== 'custom'}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} className="flex items-stretch gap-0.5">
                      {sort === 'custom' && (
                        <div {...prov.dragHandleProps} className="flex items-center justify-center w-3 text-muted-foreground cursor-grab">
                          <GripVertical className="w-3 h-3" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <ItemRow item={item} folderType={folderType} folderId={folderId} onUpdate={onUpdate} onOpen={onOpen} />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {sorted.length === 0 && emptyText && (
        <p className="text-center text-sm text-muted-foreground/50 lowercase py-12">{emptyText}</p>
      )}
    </>
  );
}