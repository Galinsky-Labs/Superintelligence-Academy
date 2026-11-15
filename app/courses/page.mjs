"use client";
import React from 'react';import AcademyFrame from '../../components/academy-frame.mjs';import CoursesApp from '../../components/courses-app.mjs';
export default function Page(){return React.createElement(AcademyFrame,{current:'/courses'},React.createElement(CoursesApp))}
