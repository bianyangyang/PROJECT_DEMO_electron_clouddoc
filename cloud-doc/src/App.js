import React, { useState } from 'react'
import { faPlus, faFileImport, faSave } from '@fortawesome/free-solid-svg-icons'
import SimpleMDE from 'react-simplemde-editor'
import uuidv4 from 'uuid/v4'
import { flattenArr, objToArr } from './utils/helper'
import fileHelper from './utils/fileHelper'

import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'easymde/dist/easymde.min.css'

import FileSearch from './components/FileSearch'
import FileList from './components/FileList'
import defaultFiles from './utils/defaultFiles'
import BottomBtn from './components/BottomBtn'
import TabList from './components/TabList'

// 导入node模块
const { join } = window.require('path') // 直接取path的join方法
const { remote } = window.require('electron')
const Store = window.require('electron-store')

const fileStore = new Store({ name: 'Files Data' }) // 存储在~/Library/ApplicationSupport/cloud-doc/Files Data.json里

// 本地持久化,新建和重命名时需要
const saveFilesToStore = files => {
  // 不必存储所有信息，例如：isNew, body等
  const fileStoreObj = objToArr(files).reduce((result, file) => {
    const { id, path, title, createdAt } = file
    result[id] = {
      id,
      path,
      title,
      createdAt
    }
    return result
  }, {})
  fileStore.set('file', fileStoreObj)
  console.log('存储结构', fileStore.get('file'))
}

function App() {
  const [files, setFiles] = useState(fileStore.get('file') || {})
  const [activeFileID, setActiveFileID] = useState('')
  const [openedFileIDs, setOpenedFileIDs] = useState([])
  const [unsavedFileIDs, setUnsavedFileIDs] = useState([])
  const [searchFiles, setSearchFiles] = useState([])

  const filesArr = objToArr(files)
  const savedLocation = remote.app.getPath('documents') // 定义本地存储路径。文稿文件夹下
  const activeFile = files[activeFileID]
  const openedFiles = openedFileIDs.map(openID => {
    return files[openID]
  })
  const fileListArr = searchFiles.length ? searchFiles : filesArr

  // 打开md文件
  const fileClick = fileID => {
    // 设置打开文件的id
    setActiveFileID(fileID)

    // 从本地读取文件
    const currentFile = files[fileID]
    if (!currentFile.isLoaded) {
      fileHelper
        .readFile(currentFile.path)
        .then(value => {
          const newFile = { ...files[fileID], body: value, isLoaded: true }
          setFiles({ ...files, [fileID]: newFile })
        })
        .catch(e => {
          console.log(e)

          delete files[fileID]
          setFiles(files)
          saveFilesToStore(files)
          // 关闭相应的以打开的tab
          tabClose(fileID)

          remote.dialog.showMessageBoxSync(
            {
              type: 'error',
              message: '该文件不存在'
            }
          )
        })
    }

    if (!openedFileIDs.includes(fileID)) {
      setOpenedFileIDs([...openedFileIDs, fileID])
    }
  }

  // 点击tab标签
  const tabClick = fileID => {
    setActiveFileID(fileID)
  }

  // 关闭tab标签
  const tabClose = id => {
    // 过滤掉关闭的标签
    const tabsWithout = openedFileIDs.filter(fileID => fileID !== id)
    setOpenedFileIDs(tabsWithout)

    // 关闭后激活第一个标签
    if (tabsWithout.length) {
      setActiveFileID(tabsWithout[0])
    } else {
      setActiveFileID('')
    }
  }

  // 监听mde内容变化的回调
  const fileChange = (id, value) => {
    // 更新md内容
    const newFile = { ...files[id], body: value }
    setFiles({ ...files, [id]: newFile })

    // 更新unsavedIDs
    if (!unsavedFileIDs.includes(id)) {
      setUnsavedFileIDs([...unsavedFileIDs, id])
    }
  }

  // 删除文件
  const deleteFile = id => {
    if(files[id].isNew) {
      const { [id]: value, ...afterDelete} = files
      setFiles(afterDelete)

      return
    }

    fileHelper.deleteFile(files[id].path).then(() => {
      const { [id]: value, ...afterDelete} = files
      setFiles(afterDelete)
      saveFilesToStore(afterDelete)
      // 关闭相应的以打开的tab
      tabClose(id)
    })
  }

  // 编辑文件名
  const updateFileName = (id, title, isNew) => {
    const newPath = join(savedLocation, `${title}.md`)
    const modifiedFile = { ...files[id], title, isNew: false, path: newPath }
    const newFiles = { ...files, [id]: modifiedFile }

    console.log(files)
    // 判断是否重名

    console.log('首次进入', files[id].title, title)
    if (files[id].title !== title) {
      console.log('修改过')
      for (let i = 0; i < filesArr.length; i++) {
        const file = filesArr[i]

        if (file.title === title) {
          console.log('重名')
          return
        }
      }
    }

    if (isNew) {
      fileHelper.writeFile(newPath, files[id].body).then(() => {
        setFiles(newFiles)
        saveFilesToStore(newFiles)
      })
    } else {
      const oldPath = join(savedLocation, `${files[id].title}.md`)
      fileHelper.renameFile(oldPath, newPath).then(() => {
        setFiles(newFiles)
        saveFilesToStore(newFiles)
      })
    }
  }

  // 搜索文件
  const fileSearch = keyword => {
    const newFiles = filesArr.filter(file => file.title.includes(keyword))
    setSearchFiles(newFiles)
  }

  // 新建文件
  const createNewFile = () => {
    const newID = uuidv4()
    const newFile = {
      id: newID,
      title: '',
      body: '## 请输出 Markdown',
      createdAt: new Date().getTime(),
      isNew: true
    }
    setFiles({ ...files, [newID]: newFile })
  }

  // 保存文件
  const saveCurrentFile = () => {
    fileHelper
      .writeFile(join(savedLocation, `${activeFile.title}.md`), activeFile.body)
      .then(() => {
        setUnsavedFileIDs(unsavedFileIDs.filter(id => id !== activeFile.id))
      })
  }

  return (
    <div className="App container-fluid px-0">
      <div className="row row no-gutters">
        <div className="col-3 bg-light left-panel">
          <FileSearch title="我的云文档" onFileSearch={fileSearch}></FileSearch>
          <FileList
            files={fileListArr}
            onFileClick={fileClick}
            onFileDelete={deleteFile}
            onSaveEdit={updateFileName}
          ></FileList>
          <div className="row no-gutters button-group">
            <div className="col">
              <BottomBtn
                text="新建"
                colorClass="btn-primary"
                icon={faPlus}
                onBtnClick={createNewFile}
              ></BottomBtn>
            </div>
            <div className="col">
              <BottomBtn
                text="导入"
                colorClass="btn-success"
                icon={faFileImport}
              ></BottomBtn>
            </div>
          </div>
        </div>
        <div className="col-9 right-panel">
          {!activeFile && (
            <div className="start-page">选择或创建新的MarkDown文档</div>
          )}
          {activeFile && (
            <>
              <TabList
                files={openedFiles}
                activeId={activeFileID}
                unsaveIds={unsavedFileIDs}
                onTabClick={tabClick}
                onCloseTab={tabClose}
              ></TabList>
              <SimpleMDE
                key={activeFile && activeFile.id}
                value={activeFile && activeFile.body}
                onChange={value => {
                  fileChange(activeFile.id, value)
                }}
                options={{
                  minHeight: '515px'
                }}
              ></SimpleMDE>
              <BottomBtn
                text="保存"
                colorClass="btn-success"
                icon={faSave}
                onBtnClick={saveCurrentFile}
              ></BottomBtn>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
